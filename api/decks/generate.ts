// Generates anatomy flashcards (Haiku, Croatian). Gated by the daily usage
// budget: a real signed-in user with budget left; the call's real token cost
// is recorded after.
//
// The gate is INLINED (not shared from a helper module): Vercel's @vercel/node
// bundler doesn't include sibling non-route files, so a `../_gate` import fails
// at runtime with ERR_MODULE_NOT_FOUND. The same ~50 lines live in
// api/agent/chat.ts — keep DAILY_TOKEN_LIMIT in sync there and in
// src/lib/usage.ts.
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

export const config = { runtime: 'nodejs' };

// Keep in sync with src/lib/usage.ts and api/agent/chat.ts.
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

const SYSTEM = `Ti si profesor anatomije. Generiraš kratke i točne kartice za učenje anatomije na hrvatskom jeziku.
Odgovaraj SAMO u JSON formatu, bez ikakvog teksta izvan JSON niza.
Format: [{"q": "Pitanje?", "a": "Odgovor."}]
Pravila:
- Pitanja i odgovori moraju biti na hrvatskom jeziku
- Svako pitanje treba biti jasno i specifično
- Odgovor treba biti koncizan (1-3 rečenice)
- Koristiti standardni hrvatski (ne srpski ili bosanski)
- Fokusiraj se na anatomske i fiziološke činjenice`;

interface GenerateBody {
  topic?: unknown;
  count?: unknown;
  userId?: unknown;
}

interface GeneratedCard {
  q: string;
  a: string;
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

  let body: GenerateBody;
  const raw = req.body;
  if (raw && typeof raw === 'object') {
    body = raw as GenerateBody;
  } else if (typeof raw === 'string') {
    try {
      body = JSON.parse(raw) as GenerateBody;
    } catch {
      res.status(400).json({ error: 'Invalid JSON body' });
      return;
    }
  } else {
    res.status(400).json({ error: 'Missing JSON body' });
    return;
  }

  const topic = typeof body.topic === 'string' ? body.topic.trim() : '';
  if (!topic) {
    res.status(400).json({ error: 'topic is required', code: 'missing_topic' });
    return;
  }

  const rawCount = typeof body.count === 'number' ? body.count : 8;
  const count = Math.max(1, Math.min(20, Math.floor(rawCount)));

  // --- Usage gate ---
  const userId = typeof body.userId === 'string' ? body.userId : undefined;
  const g = await gateDaily(userId);
  if ('denied' in g) {
    res.status(g.denied.status).json({ error: g.denied.error, code: g.denied.code });
    return;
  }

  try {
    const msg = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Generiraj točno ${count} kartica za anatomsku temu: "${topic}". Odgovaraj SAMO JSON nizom, ništa drugo.`,
        },
      ],
    });
    if (userId) {
      await recordUsage(
        userId,
        (msg.usage?.input_tokens ?? 0) + (msg.usage?.output_tokens ?? 0),
        'deck_generate',
        g.usedToday,
      );
    }

    const text = msg.content.find((b) => b.type === 'text')?.text ?? '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      res.status(502).json({ error: 'AI response did not contain a JSON array', code: 'parse_failed' });
      return;
    }

    const parsed = JSON.parse(match[0]) as unknown;
    if (!Array.isArray(parsed)) {
      res.status(502).json({ error: 'AI response is not an array', code: 'parse_failed' });
      return;
    }

    const cards = parsed.filter(
      (c): c is GeneratedCard =>
        typeof (c as GeneratedCard).q === 'string' && typeof (c as GeneratedCard).a === 'string',
    );
    res.status(200).json({ cards });
  } catch (err) {
    const status = (err as { status?: number })?.status ?? 500;
    const message = err instanceof Error ? err.message : String(err);
    res.status(status).json({ error: message, code: 'sdk_error' });
  }
}
