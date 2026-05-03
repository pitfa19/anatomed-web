import type Anthropic from '@anthropic-ai/sdk';

export interface GeneratedCard {
  q: string;
  a: string;
}

interface GenerateResponse {
  cards?: GeneratedCard[];
  error?: string;
  code?: string;
}

// Dev-only direct-to-Anthropic fallback. Mirrors `src/lib/agent.ts:12-29`:
// when `VITE_ANTHROPIC_API_KEY` is set in `.env.local`, plain `npm run dev`
// (no `vercel dev`) calls Anthropic from the browser. `import.meta.env.DEV`
// is false in production builds, so this branch is dead-code-eliminated and
// the SDK is never bundled for end-users.
const DEV_BROWSER_KEY: string | undefined =
  import.meta.env.DEV
    ? (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined)
    : undefined;

let browserClientPromise: Promise<{
  messages: { create(p: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
}> | null = null;

function getBrowserClient() {
  if (!DEV_BROWSER_KEY) return null;
  if (!browserClientPromise) {
    browserClientPromise = import('@anthropic-ai/sdk').then(
      (mod) => new mod.default({ apiKey: DEV_BROWSER_KEY, dangerouslyAllowBrowser: true }),
    );
  }
  return browserClientPromise;
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

async function generateCardsDirect(topic: string, count: number): Promise<GeneratedCard[]> {
  const client = await getBrowserClient()!;
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

  const text = msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Nevažeći odgovor od AI-a - JSON niz nije pronađen.');
  const parsed = JSON.parse(match[0]) as unknown;
  if (!Array.isArray(parsed)) throw new Error('Nevažeći format odgovora.');
  return parsed.filter(
    (c): c is GeneratedCard =>
      typeof (c as GeneratedCard).q === 'string' && typeof (c as GeneratedCard).a === 'string',
  );
}

export async function generateCards(topic: string, count = 8): Promise<GeneratedCard[]> {
  if (DEV_BROWSER_KEY) {
    return generateCardsDirect(topic, count);
  }

  const res = await fetch('/api/decks/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic, count }),
  });

  let body: GenerateResponse;
  try {
    body = (await res.json()) as GenerateResponse;
  } catch {
    throw new Error('Nevažeći odgovor od poslužitelja.');
  }

  if (!res.ok) {
    if (body.code === 'missing_key') {
      throw new Error(
        'API ključ nije postavljen na poslužitelju. Dodaj `ANTHROPIC_API_KEY` u Vercel env vars (ili u `.env.local` za `vercel dev`).',
      );
    }
    if (body.code === 'parse_failed') {
      throw new Error('Nevažeći odgovor od AI-a - JSON niz nije pronađen.');
    }
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }

  if (!Array.isArray(body.cards)) {
    throw new Error('Nevažeći format odgovora.');
  }
  return body.cards;
}
