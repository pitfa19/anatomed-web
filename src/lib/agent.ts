import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from './types';
import { TOOL_DEFINITIONS, runTool } from './tools';

const PROXY_URL = '/api/agent/chat';

async function callAnthropic(
  payload: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const r = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = await r.json();
    } catch {
      // ignore
    }
    if (r.status === 500 && body.code === 'missing_key') {
      throw new MissingApiKeyError();
    }
    throw new Error(`Agent proxy ${r.status}: ${body.error ?? r.statusText}`);
  }
  return (await r.json()) as Anthropic.Message;
}

// Hybrid model strategy: Haiku makes the first tool-decision round (cheap,
// fast - picking the right `search_skripte` query is a small decision), and
// Sonnet handles every subsequent round (writing the user-facing answer with
// citations is where prose quality matters).
const DECISION_MODEL = 'claude-haiku-4-5';
const ANSWER_MODEL = 'claude-sonnet-4-6';
const SUMMARY_MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = `Ti si asistent za studente medicine, specijaliziran za anatomiju.

JEZIK - apsolutno obavezno:
- Odgovaraj ISKLJUČIVO na hrvatskom standardnom jeziku.
- Ne koristi srpske ni bosanske oblike riječi (npr. "talas" → "val", "vazduh" → "zrak", "hiljadu" → "tisuću", "uopšte" → "uopće", "saopštiti" → "priopćiti").
- Koristi hrvatsku terminologiju i pravopis (ije/je gdje je propisano, infinitiv umjesto "da + prezent").
- Latinski anatomski termini ostaju nepromijenjeni.

FORMAT ODGOVORA - radi čitljivosti na uskom chat ekranu:
- Drži odgovore SAŽETIMA. Cilj: 4-8 redaka teksta + reference.
- Kratki odlomci (1-3 rečenice). Izbjegavaj zidove teksta.
- Koristi **podebljanje** za ključne anatomske termine kad ih prvi put spomeneš.
- Kad nabrajaš strukture, prolaze, odnose ili dijelove, koristi bullet listu (\`-\`) s **podebljanim** nazivom na početku stavke, npr. \`- **Caput femoris**: glava femura, ulazi u acetabulum.\`
- NE koristi markdown tablice (\`| Dio | Opis |\`). Tablice loše izgledaju u uskom chat sučelju.
- Ne koristi emoji ikone (🦴, 🦵, 📚, ✨ itd.) - samo običan tekst i listu.
- Ne koristi naslove (\`#\`) za kratke odgovore. Za duže odgovore smiješ koristiti \`### Naslov\`.
- Ne ponavljaj korisničko pitanje.

UVIJEK ODGOVORI NA PITANJE:
Korisnik je student medicine i očekuje sadržajno objašnjenje. Tvoja je glavna obveza objasniti pojam jasno i korektno, oslanjajući se na svoje anatomsko znanje. Alati su SAMO POMOĆ - koristi ih kad pomažu, ali nikad ne završavaj odgovor s "skripte ne pokrivaju ovo, otvori si stranicu X i provjeri" ili sličnim. Ako alat ne nađe pogodak, ne reci to - jednostavno objasni iz svog znanja bez sekcije Reference.

ALAT \`search_skripte\`:
Pretražuje skripte (Skripta A1/A2/A3, Hand-Out A1, Duale Reihe). Pomaže kad postoji pisani izvor.

Postupak:
1. Pozovi \`search_skripte\` s relevantnim latinskim terminom za ključni pojam pitanja.
2. Sažeto objasni strukturu (lokacija, sastav, funkcija, klinički značaj - samo ono što je relevantno za pitanje). Objašnjenje uvijek napiši - ne ovisi o tome jesi li dobio pogotke.
3. Ako je alat vratio pogotke, na kraju odgovora dodaj sekciju **Reference** sa kompaktnom bullet listom linkova, po jedan po pogotku, npr.:

   **Reference**
   - [Skripta A1, str. 42](/docs?q=...&doc=...&page=42)
   - [Duale Reihe, str. 800](/docs?q=...&doc=...&page=800)

   Koristi TOČNO onaj \`link\` iz alata - ne mijenjaj URL ni jednu znamenku. Maksimalno 4 reference, biraj raznolike izvore.
4. Ako alat NIJE vratio pogotke (\`matches\` prazan), izostavi sekciju Reference. NE govori "skripte ne pokrivaju ovo" niti upućuj korisnika da sam traži po stranicama - samo daj cjelovito objašnjenje iz svog znanja.

ALAT \`prikaz_3d\`:
Renderira interaktivni 3D model unutar chata. Koristi ga aktivno kad pitanje ima vizualnu/prostornu komponentu - tijek živca ili krvne žile, prostorni odnosi struktura, lokacija dijela, pripoji mišića, što leži pored čega, sastav koštane skupine. Ne zovi za pojmovna pitanja bez prostorne dimenzije (definicije, etimologija, klinički sindromi bez topografije).

Format poziva:
- \`focus\` - glavni dio koji vizualno najviše govori o pitanju. UVIJEK koristi formalni latinski ili engleski anatomski naziv kakav postoji u atlasu (npr. "Femur", "Os femoris", "Median nerve", "Musculus biceps brachii"). NE prevodi na hrvatski ("zdjelica", "natkoljenična kost") jer atlas indeks koristi engleske/latinske nazive.
- \`extras\` - 2-5 dodatnih dijelova za prostorni kontekst (okolne kosti, mišići, živci). Ne pretrpavaj - više od 5 ne pomaže razumijevanju.
- \`title\` - kratki naslov widgeta, 2-6 riječi, npr. "Tijek n. medianus".

Mali rječnik atlasa (kad ti pojam padne na pamet u hrvatskom/srednjoeuropskom obliku, koristi desnu stranu):
- zdjelica / pelvis (kao kost) → \`Hip bone\` ili \`Os coxae\`
- natkoljenica → \`Femur\` ili \`Os femoris\`
- potkoljenica → \`Tibia\`
- iverica → \`Patella\`
- nadlaktica → \`Humerus\`
- palčana kost → \`Radius\`
- lakatna kost → \`Ulna\`
- ključna kost → \`Clavicle\`
- lopatica → \`Scapula\`
- prsna kost → \`Sternum\`
- kralježnica (jedan kralježak) → \`Cervical vertebra\` / \`Thoracic vertebra\` / \`Lumbar vertebra\`
- lubanja → \`Skull\`
- moždani živci → koristi pojedinačni naziv, npr. \`Trigeminal nerve\`, \`Facial nerve\`, \`Vagus nerve\`

Generičke imenice ("pelvis", "kralježnica") same po sebi vraćaju krive parove (npr. "pelvis" → "Renal pelvis"). Uvijek navedi konkretnu strukturu.

Kad alat uspješno vrati konfiguraciju (objekt s \`focus\`, \`extras\`, \`unmatched\`):
1. Napiši kratak prose odgovor (4-6 redaka, kao i inače).
2. Ispod prose-a, NA SVOM REDU, fenced code blok jezika \`anatomy-3d\` s TOČNO onim JSON-om koji je alat vratio. Bez ikakvih izmjena, bez komentara unutar bloka. Primjer:

   \`\`\`anatomy-3d
   {"title":"...","focus":{"id":"...","name_en":"...","name_lat":"...","system":"..."},"extras":[...],"unmatched":[]}
   \`\`\`

3. Nakon bloka, ako si zvao i \`search_skripte\` i dobio pogotke, dodaj uobičajenu **Reference** sekciju.

Ako \`prikaz_3d\` vrati \`error\` (npr. \`focus\` se nije razriješio), NE emitiraj \`anatomy-3d\` blok - odgovori samo prose-om s cjelovitim objašnjenjem iz svog znanja, i referencama iz \`search_skripte\` ako ih imaš. Ne prozivaj korisnika da je tražio nešto što atlas nema; samo objasni.`;

export class MissingApiKeyError extends Error {
  constructor() {
    super('ANTHROPIC_API_KEY is not set on the server.');
    this.name = 'MissingApiKeyError';
  }
}

const MAX_TOOL_ITERATIONS = 5;

type ApiMessage = Anthropic.MessageParam;

export type ToolStatus =
  | { phase: 'thinking' }
  | { phase: 'tool'; name: string; input: Record<string, unknown> }
  | { phase: 'summarizing' }
  | null;

export interface ChatOptions {
  onStatus?: (status: ToolStatus) => void;
  /** Rolling summary of older messages (those outside the window). When
   * provided, prepended to the system prompt as background context. */
  summary?: string;
}

export async function summarizeMessages(
  toSummarize: ChatMessage[],
  existingSummary: string,
): Promise<string> {
  if (toSummarize.length === 0) return existingSummary;

  const conversation = toSummarize
    .map((m) => `${m.role === 'user' ? 'Korisnik' : 'Agent'}: ${m.text}`)
    .join('\n\n');

  const userPrompt = existingSummary
    ? `Postojeći sažetak razgovora:\n${existingSummary}\n\nNovi dio razgovora koji treba uključiti u sažetak:\n${conversation}\n\nVrati novi cjelokupni sažetak razgovora u 3-5 rečenica na hrvatskom. Sačuvaj sve ključne anatomske termine i kontekst koji bi mogao biti potreban za nastavak razgovora.`
    : `Sažmi sljedeći razgovor između studenta medicine i AI asistenta za anatomiju u 3-5 rečenica na hrvatskom. Sačuvaj ključne anatomske termine i kontekst:\n\n${conversation}`;

  const response = await callAnthropic({
    model: SUMMARY_MODEL,
    max_tokens: 400,
    messages: [{ role: 'user', content: userPrompt }],
  });

  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export async function chat(
  history: ChatMessage[],
  opts: ChatOptions = {},
): Promise<string> {
  const { onStatus, summary } = opts;

  const system = summary
    ? `${SYSTEM_PROMPT}\n\nSažetak ranijeg razgovora (van prozora konteksta):\n${summary}`
    : SYSTEM_PROMPT;

  const messages: ApiMessage[] = history.map((m) => ({
    role: m.role,
    content: m.text,
  }));

  async function runToolBlocks(
    blocks: Anthropic.ContentBlock[],
  ): Promise<Anthropic.ToolResultBlockParam[]> {
    const out: Anthropic.ToolResultBlockParam[] = [];
    for (const block of blocks) {
      if (block.type !== 'tool_use') continue;
      onStatus?.({
        phase: 'tool',
        name: block.name,
        input: (block.input as Record<string, unknown>) ?? {},
      });
      let result: unknown;
      try {
        result = await runTool(block.name, block.input);
      } catch (err) {
        result = { error: err instanceof Error ? err.message : String(err) };
      }
      out.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    }
    return out;
  }

  try {
    // Phase 1: Haiku decides whether to call a tool. Its output is *only*
    // used for tool selection - if Haiku tries to answer directly (no
    // tool_use block), we discard its text and fall through to Sonnet so
    // the user always gets a Sonnet-quality, full-budget answer.
    onStatus?.({ phase: 'thinking' });
    const decision = await callAnthropic({
      model: DECISION_MODEL,
      max_tokens: 1024,
      system,
      tools: TOOL_DEFINITIONS,
      messages,
    });

    if (decision.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: decision.content });
      const toolResults = await runToolBlocks(decision.content);
      messages.push({ role: 'user', content: toolResults });
    }
    // else: Haiku produced text-only or stopped early - discard, let Sonnet
    // produce the answer fresh.

    // Phase 2: Sonnet produces the final answer. Loops to handle any
    // additional tool_use rounds Sonnet may request.
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      onStatus?.({ phase: 'thinking' });
      const response = await callAnthropic({
        model: ANSWER_MODEL,
        max_tokens: 1024,
        system,
        tools: TOOL_DEFINITIONS,
        messages,
      });

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });
        const toolResults = await runToolBlocks(response.content);
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      return response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
    }

    return 'Agent je dosegao maksimalan broj poziva alata bez završnog odgovora.';
  } finally {
    onStatus?.(null);
  }
}
