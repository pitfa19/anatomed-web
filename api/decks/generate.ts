// TODO(server-side gate): re-check the user's token balance via the
// Supabase service role and return 402 before invoking the LLM. Today the
// gate is enforced client-side in AuthContext.consumeTokens.
import Anthropic from '@anthropic-ai/sdk';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

export const config = { runtime: 'nodejs' };

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
