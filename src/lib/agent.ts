import type Anthropic from '@anthropic-ai/sdk';
import type { ChatMessage } from './types';
import type { Lang } from './i18n';
import { TOOL_DEFINITIONS, runTool } from './tools';
import {
  MissingApiKeyError,
  DailyLimitError,
  AuthRequiredError,
  proxyError,
} from './agentErrors';

// Re-exported so existing consumers can keep importing from `agent`.
export { MissingApiKeyError, DailyLimitError, AuthRequiredError };

const PROXY_URL = '/api/agent/chat';

// Dev-only: when `VITE_ANTHROPIC_API_KEY` is set in `.env.local`, plain
// `npm run dev` (no `vercel dev`) calls Anthropic directly from the browser.
// `import.meta.env.DEV` is false in production builds, so this branch is
// dead-code-eliminated and the Anthropic SDK is never imported into the
// production bundle.
const DEV_BROWSER_KEY: string | undefined =
  import.meta.env.DEV
    ? (import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined)
    : undefined;

// Structural type for just the bits we call. Typing this as the full
// `Anthropic` instance makes `tsc -b` try to resolve the SDK as a referenced
// project (TS5083), so we keep it minimal — same reason the original only
// typed `create`.
interface BrowserAnthropic {
  messages: {
    create(p: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
    stream(
      p: Anthropic.MessageCreateParamsNonStreaming,
      options?: { signal?: AbortSignal },
    ): {
      on(event: 'text', cb: (delta: string, snapshot: string) => void): unknown;
      finalMessage(): Promise<Anthropic.Message>;
    };
  };
}

let browserClientPromise: Promise<BrowserAnthropic> | null = null;

function getBrowserClient(): Promise<BrowserAnthropic> | null {
  if (!DEV_BROWSER_KEY) return null;
  if (!browserClientPromise) {
    browserClientPromise = import('@anthropic-ai/sdk').then(
      (mod) =>
        new mod.default({
          apiKey: DEV_BROWSER_KEY,
          dangerouslyAllowBrowser: true,
        }) as unknown as BrowserAnthropic,
    );
  }
  return browserClientPromise;
}

async function callAnthropic(
  payload: Anthropic.MessageCreateParamsNonStreaming,
  userId?: string,
): Promise<Anthropic.Message> {
  const direct = getBrowserClient();
  if (direct) {
    const client = await direct;
    return client.messages.create(payload);
  }

  const r = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, userId }),
  });
  if (!r.ok) {
    let body: { error?: string; code?: string } = {};
    try {
      body = await r.json();
    } catch {
      // ignore
    }
    throw proxyError(r.status, body);
  }
  return (await r.json()) as Anthropic.Message;
}

// Streaming variant of `callAnthropic`. `onText` receives the full accumulated
// answer text after each delta (a *snapshot*, not the increment) so callers can
// render the growing answer directly. Returns the final assembled message so the
// tool-use loop can inspect `stop_reason` and `content`. Mirrors the dev-direct
// vs proxy split of `callAnthropic`: locally the SDK streams over its own SSE;
// in prod the Vercel function re-emits a tiny `delta`/`final`/`error` SSE feed.
async function streamAnthropic(
  payload: Anthropic.MessageCreateParamsNonStreaming,
  onText: (snapshot: string) => void,
  signal?: AbortSignal,
  userId?: string,
): Promise<Anthropic.Message> {
  const direct = getBrowserClient();
  if (direct) {
    const client = await direct;
    const stream = client.messages.stream(payload, { signal });
    stream.on('text', (_delta, snapshot) => onText(snapshot));
    return await stream.finalMessage();
  }

  const r = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...payload, stream: true, userId }),
    signal,
  });
  if (!r.ok || !r.body) {
    let body: { error?: string; code?: string } = {};
    try {
      body = await r.json();
    } catch {
      // ignore
    }
    throw proxyError(r.status, body);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let acc = '';
  let finalMsg: Anthropic.Message | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line.
    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const event = /^event:\s*(.+)$/m.exec(frame)?.[1]?.trim();
      const data = /^data:\s*([\s\S]+)$/m.exec(frame)?.[1];
      if (!event || data == null) continue;
      if (event === 'delta') {
        const piece = (JSON.parse(data) as { text?: string }).text;
        if (piece) {
          acc += piece;
          onText(acc);
        }
      } else if (event === 'final') {
        finalMsg = JSON.parse(data) as Anthropic.Message;
      } else if (event === 'error') {
        const e = JSON.parse(data) as { error?: string; code?: string };
        if (e.code === 'missing_key') throw new MissingApiKeyError();
        throw new Error(e.error ?? 'Agent stream error');
      }
    }
  }

  if (!finalMsg) throw new Error('Agent stream ended without a final message.');
  return finalMsg;
}

// Sonnet drives the whole user-facing turn (tool decisions + final prose).
// We previously prepended a Haiku decision round, but that pure-latency cost
// (~1 s per turn) was too high for a chat-style UX where the user is already
// staring at a spinner. Sonnet picks tools fine on its own.
// Haiku stays for rolling-window summarization (background, non-blocking).
const ANSWER_MODEL = 'claude-sonnet-4-6';
const SUMMARY_MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT_HR = `Ti si asistent za studente medicine, specijaliziran za anatomiju.

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
- Ne koristi crtice (— ili –). Umjesto njih koristi zarez, točku ili zagrade.
- Piši prirodno i izravno: kratke, jasne rečenice, kao da objašnjavaš kolegi. Bez reklamnog tona i bez praznog hoda.
- Ne koristi naslove (\`#\`) za kratke odgovore. Za duže odgovore smiješ koristiti \`### Naslov\`.
- Ne ponavljaj korisničko pitanje.

UVIJEK ODGOVORI NA PITANJE:
Korisnik je student medicine i očekuje sadržajno objašnjenje. Tvoja je glavna obveza objasniti pojam jasno i korektno, oslanjajući se na svoje anatomsko znanje. Alati su SAMO POMOĆ - koristi ih kad pomažu, ali nikad ne završavaj odgovor s "skripte ne pokrivaju ovo, otvori si stranicu X i provjeri" ili sličnim. Ako alat ne nađe pogodak, ne reci to - jednostavno objasni iz svog znanja bez sekcije Reference.

ALAT \`search_skripte\`:
Pretražuje skripte (Skripta A1/A2/A3, Hand-Out A1). Pomaže kad postoji pisani izvor.

Postupak:
1. Pozovi \`search_skripte\` s relevantnim latinskim terminom za ključni pojam pitanja.
2. Sažeto objasni strukturu (lokacija, sastav, funkcija, klinički značaj - samo ono što je relevantno za pitanje). Objašnjenje uvijek napiši - ne ovisi o tome jesi li dobio pogotke.
3. Ako je alat vratio pogotke, na kraju odgovora dodaj sekciju **Reference** sa kompaktnom bullet listom linkova, po jedan po pogotku, npr.:

   **Reference**
   - [Skripta A1, str. 42](/docs?q=...&doc=...&page=42)
   - [Skripta A2, str. 88](/docs?q=...&doc=...&page=88)

   Koristi TOČNO onaj \`link\` iz alata - ne mijenjaj URL ni jednu znamenku. Maksimalno 4 reference, biraj raznolike izvore.
4. Ako alat NIJE vratio pogotke (\`matches\` prazan), izostavi sekciju Reference. NE govori "skripte ne pokrivaju ovo" niti upućuj korisnika da sam traži po stranicama - samo daj cjelovito objašnjenje iz svog znanja.

ALAT \`prikaz_3d\`:
Renderira interaktivni 3D model unutar chata. Koristi ga aktivno kad pitanje ima vizualnu/prostornu komponentu - tijek živca ili krvne žile, prostorni odnosi struktura, lokacija dijela, pripoji mišića, što leži pored čega, sastav koštane skupine. Ne zovi za pojmovna pitanja bez prostorne dimenzije (definicije, etimologija, klinički sindromi bez topografije).

Format poziva:
- \`title\` — kratki naslov widgeta, 2-6 riječi, npr. "Tijek n. medianus" ili "Kosti stopala".
- \`parts\` — uredan popis struktura. Prva stavka postaje fokus (kamera je centrira), ostale su dodatni dijelovi. Atlas indeks koristi engleske i latinske nazive — UVIJEK koristi te oblike, NE hrvatske ("Foot bones", ne "stopalo"; "Femur", ne "natkoljenica"). Dvije vrste poziva:

  **A) Kolektivni upit** — korisnik pita o cijeloj skupini ("kosti stopala", "vratna kralježnica", "karpalne kosti", "moždani živci"). \`parts\` mora biti popis s **jednim grupnim nazivom** (alat ga sam proširi u sve članove). Pogrešno je staviti samo jednu reprezentativnu kost ili "okolne" strukture iz susjedne regije.

  Podržani grupni nazivi (koristi točan oblik s lijeva ili desna):
  - "Foot bones" / "Kosti stopala" — svih 27 kostiju stopala
  - "Tarsus" / "Tarsalne kosti" — Talus, Calcaneus, Os naviculare, Os cuboideum, 3× cuneiformia
  - "Metatarsus" / "Metatarzalne kosti" — Os metatarsi I–V
  - "Phalanges of foot" / "Falange stopala" — sve falange stopala
  - "Hand bones" / "Kosti šake" — karpus + metakarpus + falange ruke
  - "Carpus" / "Karpalne kosti" — Scaphoid, Lunate, Triquetrum, Pisiform, Trapezium, Trapezoid, Capitate, Hamate
  - "Metacarpus" / "Metakarpalne kosti" — Os metacarpi I–V
  - "Phalanges of hand" / "Falange ruke"
  - "Cervical spine" / "Vratna kralježnica" — C1–C7
  - "Thoracic spine" / "Torakalna kralježnica" — T1–T12
  - "Lumbar spine" / "Lumbalna kralježnica" — L1–L5
  - "Spine" / "Kralježnica" — cijela kralježnica + sacrum + coccyx
  - "Neurocranium" / "Moždana lubanja" — Frontal/Parietal/Occipital/Temporal/Sphenoid/Ethmoid bone
  - "Viscerocranium" / "Lice (lubanja)" — Maxilla, Mandible, Zygomatic, Nasal, Lacrimal, Palatine, Vomer, donja školjka
  - "Skull bones" / "Kosti lubanje" — neurocranium + viscerocranium + os hyoideum

  Primjer kolektivnog upita:
  Korisnik: "objasni kosti stopala"
  → \`parts: ["Foot bones"]\` ✅
  NE: \`parts: ["Foot", "Tibia", "Fibula"]\` ❌ (Tibia i Fibula su potkoljenica, a "Foot" je preopćenito.)

  **B) Fokusirani upit** — korisnik pita o jednoj strukturi i njenim odnosima ("femur", "tijek n. medianus", "musculus biceps brachii"). \`parts\` počinje glavnom strukturom, zatim 2–5 anatomski povezanih struktura **istog topografskog područja** (struktura koje se s glavnom dodiruju, prolaze pored, ili su s njom funkcionalno povezane). NIKAD ne stavljaj strukture iz susjedne regije ako ih korisnik nije eksplicitno spomenuo.

  Primjer fokusiranog upita:
  Korisnik: "objasni tijek n. medianus"
  → \`parts: ["Median nerve", "Brachial artery", "Pronator teres", "Flexor digitorum superficialis"]\` ✅

Mali rječnik atlasa (hrvatski → atlas; koristi za pojedinačne strukture):
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
- pojedini kralježak → \`Vertebra C3\` / \`Vertebra T5\` / \`Vertebra L2\` (za grupu cijele kralježnice koristi grupne nazive iznad)
- moždani živci → pojedinačni naziv, npr. \`Trigeminal nerve\`, \`Facial nerve\`, \`Vagus nerve\`

Generičke imenice ("pelvis", "stopalo", "ruka") same po sebi vraćaju krivu kost ili budu odbijene. Uvijek koristi konkretni anatomski naziv ili podržani grupni naziv iz popisa iznad.

Kad alat uspješno vrati konfiguraciju (objekt s \`focus\`, \`extras\`, \`unmatched\`, opcionalno \`expanded\`):
1. Napiši kratak prose odgovor (4-6 redaka, kao i inače). Ako je \`expanded\` prisutno, smiješ to neformalno spomenuti ("Renderirao sam svih 27 kostiju stopala…"), ali NE prepisuj polje doslovno.
2. Ispod prose-a, NA SVOM REDU, fenced code blok jezika \`anatomy-3d\` s TOČNO onim JSON-om koji je alat vratio. Bez ikakvih izmjena, bez komentara unutar bloka. Primjer:

   \`\`\`anatomy-3d
   {"title":"...","focus":{"id":"...","name_en":"...","name_lat":"...","system":"..."},"extras":[...],"unmatched":[]}
   \`\`\`

3. Nakon bloka, ako si zvao i \`search_skripte\` i dobio pogotke, dodaj uobičajenu **Reference** sekciju.

Ako \`prikaz_3d\` vrati \`error\` ili je \`unmatched\` neprazan i ostavlja nedovoljno podataka, NE emitiraj \`anatomy-3d\` blok — odgovori samo prose-om s cjelovitim objašnjenjem iz svog znanja, i referencama iz \`search_skripte\` ako ih imaš. Ne prozivaj korisnika da je tražio nešto što atlas nema; samo objasni.`;

const SYSTEM_PROMPT_EN = `You are an assistant for medical students, specialised in anatomy.

LANGUAGE - absolutely required:
- Respond EXCLUSIVELY in English.
- Latin anatomical terms remain unchanged.

RESPONSE FORMAT - for readability on a narrow chat screen:
- Keep answers CONCISE. Target: 4-8 lines of text + references.
- Short paragraphs (1-3 sentences). Avoid walls of text.
- Use **bold** for key anatomical terms the first time you mention them.
- When listing structures, pathways, relationships or parts, use a bullet list (\`-\`) with a **bold** name at the start of each item, e.g. \`- **Caput femoris**: the head of the femur, fits into the acetabulum.\`
- Do NOT use markdown tables (\`| Part | Description |\`). Tables look bad in a narrow chat interface.
- Do NOT use emoji icons (🦴, 🦵, 📚, ✨ etc.) - plain text and lists only.
- Do NOT use em-dashes (— or –). Use a comma, a period, or parentheses instead.
- Write in a plain, natural voice: short, direct sentences, the way you'd explain something to a fellow student. No marketing tone, no filler.
- Do NOT use headings (\`#\`) for short answers. For longer answers you may use \`### Heading\`.
- Do not repeat the user's question.

ALWAYS ANSWER THE QUESTION:
The user is a medical student and expects a substantive explanation. Your primary duty is to explain the concept clearly and correctly, drawing on your own anatomical knowledge. The tools are ONLY AN AID - use them when they help, but never end an answer with "the notes don't cover this, open page X and check" or similar. If a tool finds no hit, don't say so - simply explain from your own knowledge without a References section.

TOOL \`search_skripte\`:
Searches the notes (Skripta A1/A2/A3, Hand-Out A1). Useful when a written source exists.

Procedure:
1. Call \`search_skripte\` with the relevant Latin term for the key concept of the question.
2. Concisely explain the structure (location, composition, function, clinical significance - only what is relevant to the question). Always write the explanation - it does not depend on whether you got hits.
3. If the tool returned hits, add a **References** section at the end of the answer with a compact bullet list of links, one per hit, e.g.:

   **References**
   - [Skripta A1, p. 42](/docs?q=...&doc=...&page=42)
   - [Skripta A2, p. 88](/docs?q=...&doc=...&page=88)

   Use EXACTLY the \`link\` from the tool - do not change a single digit of the URL. At most 4 references, pick varied sources.
4. If the tool did NOT return hits (\`matches\` empty), omit the References section. Do NOT say "the notes don't cover this" or tell the user to search the pages themselves - just give a complete explanation from your own knowledge.

TOOL \`prikaz_3d\`:
Renders an interactive 3D model inside the chat. Use it actively when the question has a visual/spatial component - the course of a nerve or blood vessel, spatial relationships of structures, location of a part, muscle attachments, what lies next to what, the composition of a bone group. Don't call it for conceptual questions without a spatial dimension (definitions, etymology, clinical syndromes without topography).

Call format:
- \`title\` — a short widget title, 2-6 words, e.g. "Course of n. medianus" or "Bones of the foot".
- \`parts\` — a tidy list of structures. The first item becomes the focus (the camera centres on it), the rest are additional parts. The atlas index uses English and Latin names — ALWAYS use those forms ("Foot bones", not "foot"; "Femur"). Two kinds of call:

  **A) Collective query** — the user asks about a whole group ("bones of the foot", "cervical spine", "carpal bones", "cranial nerves"). \`parts\` must be a list with **a single group name** (the tool expands it into all members). It is wrong to put just one representative bone or "surrounding" structures from a neighbouring region.

  Supported group names (use the exact form, left or right):
  - "Foot bones" / "Kosti stopala" — all 27 bones of the foot
  - "Tarsus" / "Tarsalne kosti" — Talus, Calcaneus, Os naviculare, Os cuboideum, 3× cuneiformia
  - "Metatarsus" / "Metatarzalne kosti" — Os metatarsi I–V
  - "Phalanges of foot" / "Falange stopala" — all phalanges of the foot
  - "Hand bones" / "Kosti šake" — carpus + metacarpus + phalanges of the hand
  - "Carpus" / "Karpalne kosti" — Scaphoid, Lunate, Triquetrum, Pisiform, Trapezium, Trapezoid, Capitate, Hamate
  - "Metacarpus" / "Metakarpalne kosti" — Os metacarpi I–V
  - "Phalanges of hand" / "Falange ruke"
  - "Cervical spine" / "Vratna kralježnica" — C1–C7
  - "Thoracic spine" / "Torakalna kralježnica" — T1–T12
  - "Lumbar spine" / "Lumbalna kralježnica" — L1–L5
  - "Spine" / "Kralježnica" — the whole spine + sacrum + coccyx
  - "Neurocranium" / "Moždana lubanja" — Frontal/Parietal/Occipital/Temporal/Sphenoid/Ethmoid bone
  - "Viscerocranium" / "Lice (lubanja)" — Maxilla, Mandible, Zygomatic, Nasal, Lacrimal, Palatine, Vomer, inferior concha
  - "Skull bones" / "Kosti lubanje" — neurocranium + viscerocranium + os hyoideum

  Example of a collective query:
  User: "explain the bones of the foot"
  → \`parts: ["Foot bones"]\` ✅
  NOT: \`parts: ["Foot", "Tibia", "Fibula"]\` ❌ (Tibia and Fibula are the lower leg, and "Foot" is too generic.)

  **B) Focused query** — the user asks about a single structure and its relationships ("femur", "course of n. medianus", "musculus biceps brachii"). \`parts\` starts with the main structure, then 2–5 anatomically related structures **of the same topographic region** (structures that touch the main one, pass alongside it, or are functionally connected to it). NEVER include structures from a neighbouring region unless the user explicitly mentioned them.

  Example of a focused query:
  User: "explain the course of n. medianus"
  → \`parts: ["Median nerve", "Brachial artery", "Pronator teres", "Flexor digitorum superficialis"]\` ✅

A small atlas glossary (common name → atlas; use for individual structures):
- hip bone / pelvis (as a bone) → \`Hip bone\` or \`Os coxae\`
- thigh → \`Femur\` or \`Os femoris\`
- lower leg → \`Tibia\`
- kneecap → \`Patella\`
- upper arm → \`Humerus\`
- radius → \`Radius\`
- ulna → \`Ulna\`
- collarbone → \`Clavicle\`
- shoulder blade → \`Scapula\`
- breastbone → \`Sternum\`
- a single vertebra → \`Vertebra C3\` / \`Vertebra T5\` / \`Vertebra L2\` (for the whole-spine group use the group names above)
- cranial nerves → the individual name, e.g. \`Trigeminal nerve\`, \`Facial nerve\`, \`Vagus nerve\`

Generic nouns ("pelvis", "foot", "hand") on their own return the wrong bone or get rejected. Always use the specific anatomical name or a supported group name from the list above.

When the tool successfully returns a configuration (an object with \`focus\`, \`extras\`, \`unmatched\`, optionally \`expanded\`):
1. Write a short prose answer (4-6 lines, as usual). If \`expanded\` is present, you may mention it informally ("I rendered all 27 bones of the foot…"), but do NOT copy the field verbatim.
2. Below the prose, ON ITS OWN LINE, a fenced code block of language \`anatomy-3d\` with EXACTLY the JSON the tool returned. No changes whatsoever, no comments inside the block. Example:

   \`\`\`anatomy-3d
   {"title":"...","focus":{"id":"...","name_en":"...","name_lat":"...","system":"..."},"extras":[...],"unmatched":[]}
   \`\`\`

3. After the block, if you also called \`search_skripte\` and got hits, add the usual **References** section.

If \`prikaz_3d\` returns an \`error\` or \`unmatched\` is non-empty and leaves too little data, do NOT emit the \`anatomy-3d\` block — answer only with prose giving a complete explanation from your own knowledge, plus references from \`search_skripte\` if you have them. Don't call out the user for searching for something the atlas lacks; just explain.`;

function systemPromptFor(lang: Lang): string {
  return lang === 'en' ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_HR;
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
  /** Called with the full accumulated answer text after each streamed delta,
   * so the UI can render the answer as it arrives. Reset to '' between tool
   * iterations (the visible answer is the final, post-tool turn). */
  onDelta?: (text: string) => void;
  /** Rolling summary of older messages (those outside the window). When
   * provided, prepended to the system prompt as background context. */
  summary?: string;
  /** UI language; selects the system-prompt + summary language. */
  lang?: Lang;
  /** Abort the in-flight request (Stop button). */
  signal?: AbortSignal;
  /** Signed-in user id, forwarded to the proxy for the server-side token
   *  gate. Ignored on the dev browser-direct path. */
  userId?: string;
}

export async function summarizeMessages(
  toSummarize: ChatMessage[],
  existingSummary: string,
  lang: Lang = 'hr',
  userId?: string,
): Promise<string> {
  if (toSummarize.length === 0) return existingSummary;

  const userLabel = lang === 'en' ? 'User' : 'Korisnik';
  const conversation = toSummarize
    .map((m) => `${m.role === 'user' ? userLabel : 'Agent'}: ${m.text}`)
    .join('\n\n');

  const userPrompt =
    lang === 'en'
      ? existingSummary
        ? `Existing conversation summary:\n${existingSummary}\n\nNew part of the conversation to fold into the summary:\n${conversation}\n\nReturn a new complete summary of the conversation in 3-5 sentences in English. Preserve all key anatomical terms and any context that might be needed to continue the conversation.`
        : `Summarize the following conversation between a medical student and an AI anatomy assistant in 3-5 sentences in English. Preserve the key anatomical terms and context:\n\n${conversation}`
      : existingSummary
        ? `Postojeći sažetak razgovora:\n${existingSummary}\n\nNovi dio razgovora koji treba uključiti u sažetak:\n${conversation}\n\nVrati novi cjelokupni sažetak razgovora u 3-5 rečenica na hrvatskom. Sačuvaj sve ključne anatomske termine i kontekst koji bi mogao biti potreban za nastavak razgovora.`
        : `Sažmi sljedeći razgovor između studenta medicine i AI asistenta za anatomiju u 3-5 rečenica na hrvatskom. Sačuvaj ključne anatomske termine i kontekst:\n\n${conversation}`;

  const response = await callAnthropic(
    {
      model: SUMMARY_MODEL,
      max_tokens: 400,
      messages: [{ role: 'user', content: userPrompt }],
    },
    userId,
  );

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
  const { onStatus, onDelta, summary, lang = 'hr', signal, userId } = opts;

  const basePrompt = systemPromptFor(lang);
  const summaryHeading =
    lang === 'en'
      ? 'Summary of the earlier conversation (outside the context window):'
      : 'Sažetak ranijeg razgovora (van prozora konteksta):';
  const system = summary ? `${basePrompt}\n\n${summaryHeading}\n${summary}` : basePrompt;

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
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      onStatus?.({ phase: 'thinking' });
      const response = await streamAnthropic(
        {
          model: ANSWER_MODEL,
          // Generous budget so a `prikaz_3d` response with a 27-part group
          // (~1k tokens of JSON the model must echo verbatim in the
          // `anatomy-3d` block) plus prose + references still fits without
          // hitting `max_tokens` and truncating mid-output.
          max_tokens: 4096,
          system,
          tools: TOOL_DEFINITIONS,
          messages,
        },
        (snapshot) => onDelta?.(snapshot),
        signal,
        userId,
      );

      if (response.stop_reason === 'tool_use') {
        messages.push({ role: 'assistant', content: response.content });
        const toolResults = await runToolBlocks(response.content);
        messages.push({ role: 'user', content: toolResults });
        // Drop any pre-tool partial text; the user-facing answer is the
        // next (post-tool) turn, which streams in fresh.
        onDelta?.('');
        continue;
      }

      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('\n');
      if (!text.trim()) {
        // Defensive: if the model returns no text (e.g. truncated by
        // `max_tokens`, refused, or otherwise empty), surface a visible
        // message instead of an empty assistant bubble that looks like
        // the message disappeared.
        return lang === 'en'
          ? `The agent returned an empty response (stop_reason: ${response.stop_reason ?? 'unknown'}). Please try again.`
          : `Agent je vratio prazan odgovor (stop_reason: ${response.stop_reason ?? 'unknown'}). Pokušaj ponovno.`;
      }
      return text;
    }

    return lang === 'en'
      ? 'The agent reached the maximum number of tool calls without a final answer.'
      : 'Agent je dosegao maksimalan broj poziva alata bez završnog odgovora.';
  } finally {
    onStatus?.(null);
  }
}
