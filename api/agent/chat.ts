// TODO(server-side gate): re-check the user's token balance via the
// Supabase service role and return 402 (or a structured `code: 'no_tokens'`)
// before invoking the LLM. Today the gate is enforced client-side in
// AuthContext.consumeTokens; this route trusts the client.
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export const config = { runtime: 'nodejs', maxDuration: 60 };

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
  let payload: Anthropic.MessageCreateParamsNonStreaming;
  const raw = req.body;
  if (raw && typeof raw === 'object') {
    payload = raw as Anthropic.MessageCreateParamsNonStreaming;
  } else if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw) as Anthropic.MessageCreateParamsNonStreaming;
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
  } else {
    res.status(400).json({ error: 'Missing JSON body' });
    return;
  }

  // Streaming path: the client sets `stream: true` and reads a tiny SSE feed
  // (`delta` text increments, then one `final` with the full message so the
  // tool-use loop can inspect `stop_reason`/`content`, or `error`).
  if ((payload as { stream?: unknown }).stream === true) {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // don't let any proxy buffer it
    res.flushHeaders?.();

    const stream = client.messages.stream(payload);
    // If the browser disconnects (Stop, navigation), stop the upstream call.
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
