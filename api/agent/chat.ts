// TODO(server-side gate): re-check the user's token balance via the
// Supabase service role and return 402 (or a structured `code: 'no_tokens'`)
// before invoking the LLM. Today the gate is enforced client-side in
// AuthContext.consumeTokens; this route trusts the client.
import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export const config = { runtime: 'nodejs', maxDuration: 60 };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!client) {
    return json({ error: 'ANTHROPIC_API_KEY not set on server', code: 'missing_key' }, 500);
  }

  let payload: Anthropic.MessageCreateParamsNonStreaming;
  try {
    payload = (await req.json()) as Anthropic.MessageCreateParamsNonStreaming;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  try {
    const response = await client.messages.create(payload);
    return json(response, 200);
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message }, status);
  }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
