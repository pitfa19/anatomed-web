export interface GeneratedCard {
  q: string;
  a: string;
}

interface GenerateResponse {
  cards?: GeneratedCard[];
  error?: string;
  code?: string;
}

export async function generateCards(topic: string, count = 8): Promise<GeneratedCard[]> {
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
