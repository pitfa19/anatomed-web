// Proxy to Anthropic that holds the API key server-side. Hardened so it only
// serves this app, not arbitrary callers who'd otherwise bill the deployer's
// key (it used to forward any client payload with no auth — an open proxy).
//
// Two layers:
//   1. Hard caps — model allowlist, max_tokens clamp, message/body size caps.
//      Bounds the cost of any single call regardless of who makes it.
//   2. Token gate — every call must carry a `userId` of a real `public.users`
//      row (checked via the Supabase SERVICE ROLE, bypassing RLS). Billed
//      (Sonnet answer) calls decrement one credit; unbilled (Haiku summary)
//      calls just need a valid user. Anonymous callers get 401.
//
// Fails CLOSED: if the service-role env isn't configured the gate denies
// rather than reopening the hole — so prod MUST set SUPABASE_SERVICE_ROLE_KEY
// (+ SUPABASE_URL, or it falls back to VITE_SUPABASE_URL) alongside
// ANTHROPIC_API_KEY.
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const admin =
  supabaseUrl && serviceKey
    ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
    : null;

export const config = { runtime: 'nodejs', maxDuration: 60 };

// Only the models this app uses. Blocks billing premium models to the key.
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
  'claude-haiku-4-5-20251001',
]);
// The user-facing answer model; Haiku calls are background summaries (free).
const BILLED_MODEL = 'claude-sonnet-4-6';
const MAX_OUTPUT_TOKENS = 4096;
const MAX_MESSAGES = 64;
const MAX_BODY_BYTES = 1_000_000;
const TOKEN_COST = 1; // mirrors FEATURE_COST.agent_chat

interface GateDenied {
  status: number;
  code: string;
  error: string;
}

/** Returns null when the call may proceed, or a {status, code} to reject with.
 *  Billed calls atomically decrement one credit (race-safe via `gte`). */
async function gate(userId: string | undefined, billed: boolean): Promise<GateDenied | null> {
  if (!admin) {
    return { status: 500, code: 'gate_unavailable', error: 'Token gate is not configured on the server.' };
  }
  if (!userId || typeof userId !== 'string') {
    return { status: 401, code: 'auth_required', error: 'Sign in to use the assistant.' };
  }
  const { data: user, error } = await admin
    .from('users')
    .select('id, credits')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    return { status: 500, code: 'gate_error', error: error.message };
  }
  if (!user) {
    return { status: 401, code: 'auth_required', error: 'Sign in to use the assistant.' };
  }
  if (!billed) return null; // valid user is enough for a free (summary) call

  if ((user.credits ?? 0) < TOKEN_COST) {
    return { status: 402, code: 'no_tokens', error: 'Not enough credits.' };
  }
  // Conditional decrement — only succeeds if credits are still sufficient,
  // so concurrent requests can't drive the balance negative.
  const { data: updated, error: uErr } = await admin
    .from('users')
    .update({ credits: user.credits - TOKEN_COST })
    .eq('id', userId)
    .gte('credits', TOKEN_COST)
    .select('id')
    .maybeSingle();
  if (uErr) return { status: 500, code: 'gate_error', error: uErr.message };
  if (!updated) return { status: 402, code: 'no_tokens', error: 'Not enough credits.' };
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  if (!client) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server', code: 'missing_key' });
    return;
  }

  // With `shouldAddHelpers: true` (Vercel's Node launcher default), `req.body`
  // is the parsed JSON when `content-type: application/json`. Fall back to
  // re-parsing the raw body if a client sends it stringified.
  let body: Record<string, unknown>;
  const raw = req.body;
  if (raw && typeof raw === 'object') {
    body = raw as Record<string, unknown>;
  } else if (typeof raw === 'string') {
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
  } else {
    res.status(400).json({ error: 'Missing JSON body' });
    return;
  }

  // Split off our control fields; everything else is the Anthropic payload.
  // `userId`/`stream` must not reach the API (it would reject unknown fields).
  const userId = typeof body.userId === 'string' ? body.userId : undefined;
  const wantsStream = body.stream === true;
  const payload = body as unknown as Anthropic.MessageCreateParamsNonStreaming & {
    userId?: string;
    stream?: boolean;
  };
  delete payload.userId;
  delete payload.stream;

  // --- Hard caps (apply to everyone, before touching the LLM) ---
  if (typeof payload.model !== 'string' || !ALLOWED_MODELS.has(payload.model)) {
    res.status(400).json({ error: 'Model not allowed', code: 'invalid_model' });
    return;
  }
  if (typeof payload.max_tokens === 'number') {
    payload.max_tokens = Math.min(Math.max(1, Math.floor(payload.max_tokens)), MAX_OUTPUT_TOKENS);
  } else {
    payload.max_tokens = MAX_OUTPUT_TOKENS;
  }
  if (!Array.isArray(payload.messages) || payload.messages.length > MAX_MESSAGES) {
    res.status(400).json({ error: 'Too many messages', code: 'payload_too_large' });
    return;
  }
  if (Buffer.byteLength(JSON.stringify(payload), 'utf8') > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'Payload too large', code: 'payload_too_large' });
    return;
  }

  // --- Token gate ---
  const denied = await gate(userId, payload.model === BILLED_MODEL);
  if (denied) {
    res.status(denied.status).json({ error: denied.error, code: denied.code });
    return;
  }

  // --- Streaming path: re-emit a tiny `delta`/`final`/`error` SSE feed ---
  if (wantsStream) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // don't let any proxy buffer it
    res.flushHeaders?.();

    const stream = client.messages.stream(payload);
    req.on('close', () => {
      try {
        stream.abort();
      } catch {
        // already settled
      }
    });

    try {
      stream.on('text', (delta) => {
        res.write(`event: delta\ndata: ${JSON.stringify({ text: delta })}\n\n`);
      });
      const final = await stream.finalMessage();
      res.write(`event: final\ndata: ${JSON.stringify(final)}\n\n`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      res.end();
    }
    return;
  }

  try {
    const response = await client.messages.create(payload);
    res.status(200).json(response);
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    const message = err instanceof Error ? err.message : String(err);
    res.status(status).json({ error: message });
  }
}
