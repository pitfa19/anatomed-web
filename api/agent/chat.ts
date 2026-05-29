// Proxy to Anthropic that holds the API key server-side. Hardened so it only
// serves this app, not arbitrary callers who'd otherwise bill the deployer's
// key (it used to forward any client payload with no auth — an open proxy).
//
// Two layers:
//   1. Hard caps — model allowlist, max_tokens clamp, message/body size caps.
//      Bounds the cost of any single call regardless of who makes it.
//   2. Usage gate — every call must carry a `userId` of a real `public.users`
//      row (checked via the Supabase SERVICE ROLE). The user must have daily
//      AI-token budget left; after the call we record its real token cost.
//      Anonymous callers get 401, over-budget users get 429.
//
// The gate (gateDaily/recordUsage) is INLINED rather than shared from a helper
// module: Vercel's @vercel/node bundler does not include sibling files that
// aren't themselves routes, so a `../_gate` import fails at runtime with
// ERR_MODULE_NOT_FOUND. The same ~50 lines live in api/decks/generate.ts —
// keep DAILY_TOKEN_LIMIT in sync there and in src/lib/usage.ts.
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

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
const MAX_OUTPUT_TOKENS = 4096;
const MAX_MESSAGES = 64;
const MAX_BODY_BYTES = 1_000_000;
// Keep in sync with src/lib/usage.ts and api/decks/generate.ts.
const DAILY_TOKEN_LIMIT = 200_000;

interface GateDenied {
  status: number;
  code: string;
  error: string;
}
type GateResult = { denied: GateDenied } | { ok: true; usedToday: number };

function startOfUtcDayISO(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  ).toISOString();
}

async function usageToday(userId: string): Promise<number> {
  if (!admin) return 0;
  const { data, error } = await admin
    .from('token_transactions')
    .select('delta')
    .eq('user_id', userId)
    .eq('kind', 'consumption')
    .gte('created_at', startOfUtcDayISO());
  if (error || !data) return 0;
  return (data as { delta: number | null }[]).reduce(
    (sum, r) => sum + Math.max(0, -(r.delta ?? 0)),
    0,
  );
}

/** Verify a real signed-in user with budget left today; return tokens used so far. */
async function gateDaily(userId: string | undefined): Promise<GateResult> {
  if (!admin) {
    return { denied: { status: 500, code: 'gate_unavailable', error: 'Usage gate is not configured on the server.' } };
  }
  if (!userId || typeof userId !== 'string') {
    return { denied: { status: 401, code: 'auth_required', error: 'Sign in to use the assistant.' } };
  }
  const { data: user, error } = await admin
    .from('users')
    .select('id')
    .eq('id', userId)
    .maybeSingle();
  if (error) return { denied: { status: 500, code: 'gate_error', error: error.message } };
  if (!user) {
    return { denied: { status: 401, code: 'auth_required', error: 'Sign in to use the assistant.' } };
  }
  const usedToday = await usageToday(userId);
  if (usedToday >= DAILY_TOKEN_LIMIT) {
    return { denied: { status: 429, code: 'daily_limit', error: "You've reached today's AI limit." } };
  }
  return { ok: true, usedToday };
}

/** Log a call's real token cost as a consumption row. Best-effort: never throws. */
async function recordUsage(
  userId: string,
  tokens: number,
  feature: 'agent_chat' | 'deck_generate',
  usedBefore: number,
): Promise<void> {
  if (!admin || !Number.isFinite(tokens) || tokens <= 0) return;
  const remaining = Math.max(0, DAILY_TOKEN_LIMIT - (usedBefore + tokens));
  const { error } = await admin.from('token_transactions').insert({
    user_id: userId,
    kind: 'consumption',
    delta: -Math.round(tokens),
    balance_after: remaining,
    feature,
  });
  if (error) console.warn('recordUsage failed', error.message);
}

/** Total tokens a finished message cost (what we meter against the budget). */
function tokensOf(usage: Anthropic.Usage | undefined): number {
  return (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
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

  // --- Usage gate ---
  const g = await gateDaily(userId);
  if ('denied' in g) {
    res.status(g.denied.status).json({ error: g.denied.error, code: g.denied.code });
    return;
  }
  const usedToday = g.usedToday;

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
      // Meter the real token cost (await before ending so the write lands).
      if (userId) await recordUsage(userId, tokensOf(final.usage), 'agent_chat', usedToday);
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
    if (userId) await recordUsage(userId, tokensOf(response.usage), 'agent_chat', usedToday);
    res.status(200).json(response);
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    const message = err instanceof Error ? err.message : String(err);
    res.status(status).json({ error: message });
  }
}
