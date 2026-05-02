import type Anthropic from '@anthropic-ai/sdk';
import { fuzzyMatch, getSourceForDoc, loadUnifiedIndex } from './data';
import { loadCatalog } from './viewer/catalog';
import { resolvePartByQuery } from './viewer/resolveParts';
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
      '(tijek živca/krvne žile, prostorni odnosi struktura, lokacija dijela, pripoji mišića). ' +
      'Nemoj zvati za pojmovna pitanja gdje 3D ne pomaže (definicije, etimologija, klinički koncepti).',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description:
            'Kratki naslov widgeta, 2-6 riječi, npr. "Tijek n. medianus" ili "Femur i okolni mišići".',
        },
        focus: {
          type: 'string',
          description:
            'Glavni dio koji treba izolirati. Latinski naziv je obično najpouzdaniji, npr. "Femur", "Median nerve", "Musculus biceps brachii".',
        },
        extras: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Dodatni povezani dijelovi (2-5) za prostorni kontekst, npr. okolne kosti, mišići, živci. Više od 5 ne pomaže razumijevanju.',
        },
      },
      required: ['title', 'focus'],
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
  focus?: unknown;
  extras?: unknown;
}): Promise<Anatomy3DConfig | { error: string }> {
  const title = typeof input.title === 'string' ? input.title.trim() : '';
  const focusQuery = typeof input.focus === 'string' ? input.focus.trim() : '';
  if (!title) return { error: 'title je obavezan' };
  if (!focusQuery) return { error: 'focus je obavezan' };

  const catalog = await loadCatalog();
  const focusPart = resolvePartByQuery(catalog, focusQuery);
  if (!focusPart) {
    return { error: `Nije pronađen dio: "${focusQuery}"` };
  }

  const extrasIn = Array.isArray(input.extras) ? input.extras : [];
  const resolvedExtras: Anatomy3DPartRef[] = [];
  const seenIds = new Set<string>([focusPart.id]);
  const unmatched: string[] = [];
  for (const e of extrasIn) {
    if (typeof e !== 'string') continue;
    const q = e.trim();
    if (!q) continue;
    const part = resolvePartByQuery(catalog, q);
    if (!part) {
      unmatched.push(q);
      continue;
    }
    if (seenIds.has(part.id)) continue;
    seenIds.add(part.id);
    resolvedExtras.push(partRef(part));
  }

  return {
    title,
    focus: partRef(focusPart),
    extras: resolvedExtras,
    unmatched,
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
