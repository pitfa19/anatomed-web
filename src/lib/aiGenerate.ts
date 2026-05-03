import Anthropic from '@anthropic-ai/sdk';

export interface GeneratedCard {
  q: string;
  a: string;
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

export async function generateCards(topic: string, count = 8): Promise<GeneratedCard[]> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string;
  if (!apiKey) throw new Error('API ključ nije postavljen u .env.local');

  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

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
  if (!match) throw new Error('Nevažeći odgovor od AI-a — JSON niz nije pronađen.');

  const parsed = JSON.parse(match[0]) as unknown[];
  if (!Array.isArray(parsed)) throw new Error('Nevažeći format odgovora.');
  return parsed.filter(
    (c): c is GeneratedCard =>
      typeof (c as GeneratedCard).q === 'string' && typeof (c as GeneratedCard).a === 'string',
  );
}
