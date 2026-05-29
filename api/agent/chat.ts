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
//      Anonymous callers get 401, over-budget users get 429. See `api/_gate.ts`.
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { gateDaily, recordUsage } from '../_gate';

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

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
