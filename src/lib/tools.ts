import type Anthropic from '@anthropic-ai/sdk';
import { fuzzyMatch, getSourceForDoc, loadUnifiedIndex } from './data';
import { loadCatalog } from './viewer/catalog';
import { resolveQueryToParts } from './viewer/resolveParts';
import type { Anatomy3DConfig, Anatomy3DPartRef, Hit } from './types';
import type { Part } from './viewer/types';

export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'search_skripte',
    description:
      'Pretražuje sve indeksirane skripte (Skripta A1/A2/A3, Hand-Out A1, Duale Reihe) za anatomski termin. ' +
      'Koristi ga kad korisnik pita o anatomskoj strukturi ili terminu. ' +
      'Vraća do 3 najbolje pogođena termina, s do 5 izvadaka po terminu, te markdown link na konkretnu stranicu skripte (otvara se s terminom u tražilici i istaknutim na stranici).',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Anatomski pojam za pretragu, npr. "fissura orbitalis superior", "femur", "musculus deltoideus".',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'prikaz_3d',
    description:
      'Renderira interaktivni 3D model anatomskih struktura unutar chata. ' +
      'Koristi DODATNO uz `search_skripte` kad pitanje ima vizualnu/prostornu komponentu ' +
      '(tijek živca/krvne žile, prostorni odnosi struktura, lokacija dijela, pripoji mišića, sastav koštane skupine). ' +
      'Nemoj zvati za pojmovna pitanja gdje 3D ne pomaže (definicije, etimologija, klinički koncepti).',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Kratki naslov widgeta, 2-6 riječi, npr. "Tijek n. medianus" ili "Kosti stopala".',
        },
        parts: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Uredan popis struktura za prikaz. Prva stavka postaje fokus (kamera je centrira), ostale su dodatni dijelovi. ' +
            'Stavka može biti pojedinačna struktura (npr. "Femur", "Median nerve") ili grupni naziv ' +
            '(npr. "Foot bones", "Kosti stopala", "Tarsus", "Cervical spine") koji alat sam proširi u sve članove grupe. ' +
            'Za fokusirana pitanja: 1 glavna struktura + 2-5 anatomski povezanih. ' +
            'Za kolektivna pitanja: jedan grupni naziv ili eksplicitan popis svih članova.',
        },
      },
      required: ['title', 'parts'],
    },
  },
];

interface SearchHitOut {
  doc_label: string;
  doc_badge: string;
  page: number;
  snippet: string;
  link: string;
}

interface SearchMatchOut {
  term: string;
  total_hits: number;
  hits: SearchHitOut[];
}

interface SearchToolOut {
  query: string;
  matches: SearchMatchOut[];
  note?: string;
}

function buildLink(doc: string, term: string, page: number): string {
  const params = new URLSearchParams({ q: term, doc, page: String(page) });
  return `/docs?${params.toString()}`;
}

function snippetFromHit(h: Hit): string {
  const pre = h.pre.replace(/\s+/g, ' ').trim();
  const post = h.post.replace(/\s+/g, ' ').trim();
  return `…${pre} **${h.match}** ${post}…`;
}

export async function runSearchSkripte(query: string): Promise<SearchToolOut> {
  const trimmed = query.trim();
  if (!trimmed) return { query, matches: [], note: 'Prazan upit.' };

  const data = await loadUnifiedIndex();
  const matched = fuzzyMatch(trimmed, data.allTerms, 3);
  if (matched.length === 0) {
    return { query, matches: [], note: `Nema podudaranja za "${trimmed}".` };
  }

  const matches: SearchMatchOut[] = matched.map((term) => {
    const all = data.index[term] ?? [];
    const sampled = all.slice(0, 5);
    return {
      term,
      total_hits: all.length,
      hits: sampled.map((h) => ({
        doc_label: getSourceForDoc(h.doc)?.label ?? h.doc,
        doc_badge: getSourceForDoc(h.doc)?.badge ?? '',
        page: h.page,
        snippet: snippetFromHit(h),
        link: buildLink(h.doc, term, h.page),
      })),
    };
  });

  return { query, matches };
}

function partRef(p: Part): Anatomy3DPartRef {
  return {
    id: p.id,
    name_en: p.name_en,
    name_lat: p.name_lat,
    system: p.system,
  };
}

export async function runPrikaz3d(input: {
  title?: unknown;
  parts?: unknown;
  // Legacy schema, accepted for backward-compat with persisted chats / older
  // tool calls. Translated to `parts` if `parts` itself is missing.
  focus?: unknown;
  extras?: unknown;
}): Promise<Anatomy3DConfig | { error: string }> {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  if (!title) return { error: 'title je obavezan' };

  // Normalize input to a flat string list. Prefer `parts`; fall back to
  // `[focus, ...extras]` if the agent used the legacy schema.
  let queries: string[] = [];
  if (Array.isArray(input.parts)) {
    queries = input.parts.filter((p): p is string => typeof p === 'string');
  } else if (typeof input.focus === 'string') {
    queries = [input.focus];
    if (Array.isArray(input.extras)) {
      for (const e of input.extras) if (typeof e === 'string') queries.push(e);
    }
  }
  queries = queries.map((q) => q.trim()).filter(Boolean);
  if (queries.length === 0) return { error: 'parts je obavezan (lista struktura)' };

  const catalog = await loadCatalog();

  const seenIds = new Set<string>();
  const ordered: Part[] = [];
  const unmatched: string[] = [];
  const expanded: { query: string; label: string; count: number }[] = [];

  for (const q of queries) {
    const resolved = resolveQueryToParts(catalog, q);
    if (!resolved) {
      unmatched.push(q);
      continue;
    }
    if (resolved.expanded) {
      expanded.push({
        query: q,
        label: resolved.expanded.label,
        count: resolved.expanded.count,
      });
    }
    for (const p of resolved.parts) {
      if (seenIds.has(p.id)) continue;
      seenIds.add(p.id);
      ordered.push(p);
    }
  }

  if (ordered.length === 0) {
    return {
      error: `Nije pronađen nijedan dio. Neusklađeno: ${unmatched.join(', ')}`,
    };
  }

  const [focus, ...rest] = ordered;
  return {
    title,
    focus: partRef(focus!),
    extras: rest.map(partRef),
    unmatched,
    ...(expanded.length > 0 ? { expanded } : {}),
  };
}

export async function runTool(name: string, input: unknown): Promise<unknown> {
  switch (name) {
    case 'search_skripte': {
      const q = (input as { query?: unknown })?.query;
      if (typeof q !== 'string') return { error: 'query must be a string' };
      return runSearchSkripte(q);
    }
    case 'prikaz_3d': {
      return runPrikaz3d((input as Record<string, unknown>) ?? {});
    }
    default:
      return { error: `Unknown tool: ${name}` };
  }
}
