import type {
  Hit,
  PdfDoc,
  ReviseGroup,
  ReviseTopic,
  SourceMeta,
  UnifiedIndex,
} from './types';
import {
  isLocalDocName,
  isLocalSlug,
  listLocalDocs,
  loadLocalPageImageBlob,
  loadLocalPdfDoc,
  loadLocalRenderedMeta,
  loadLocalPageSpans,
  localDocNameToSlug,
  saveLocalPageImageBlob,
} from './localDocs';

const PDFS_BASE_URL = (import.meta.env.VITE_PDFS_BASE_URL ?? '/pdfs').replace(/\/$/, '');
const PDFS_RENDERED_BASE_URL = (
  import.meta.env.VITE_PDFS_RENDERED_BASE_URL ?? '/pdfs-rendered'
).replace(/\/$/, '');

const BUNDLED_SOURCES: SourceMeta[] = [
  { doc: 'Skripta A1 ispravljena.pdf', label: 'Skripta A1', badge: 'A1', color: '#4a9eff' },
  { doc: 'Skripta A2 ispravljena.pdf', label: 'Skripta A2', badge: 'A2', color: '#7c5cff' },
  { doc: 'Skripta A3 ispravljena.pdf', label: 'Skripta A3', badge: 'A3', color: '#ff5cb1' },
  { doc: 'Hand-Out - A1 (Ivan Banovac).pdf', label: 'Hand-Out A1', badge: 'HO', color: '#ff9f3d' },
  { doc: 'Duale Reihe_Searchable.pdf', label: 'Duale Reihe', badge: 'DR', color: '#16a34a' },
];

const BUNDLED_DOC_NAMES = new Set(BUNDLED_SOURCES.map((s) => s.doc));

const PDF_FILES: Record<string, string> = {
  'Skripta A1 ispravljena.pdf': '/data/skripta_a1.json',
  'Skripta A2 ispravljena.pdf': '/data/skripta_a2.json',
  'Skripta A3 ispravljena.pdf': '/data/skripta_a3.json',
  'Hand-Out - A1 (Ivan Banovac).pdf': '/data/handout_a1.json',
  'Duale Reihe_Searchable.pdf': '/data/duale_reihe.json',
};

const PDF_URLS: Record<string, string> = {
  'Skripta A1 ispravljena.pdf': `${PDFS_BASE_URL}/Skripta%20A1%20ispravljena.pdf`,
  'Skripta A2 ispravljena.pdf': `${PDFS_BASE_URL}/Skripta%20A2%20ispravljena.pdf`,
  'Skripta A3 ispravljena.pdf': `${PDFS_BASE_URL}/Skripta%20A3%20ispravljena.pdf`,
  'Hand-Out - A1 (Ivan Banovac).pdf': `${PDFS_BASE_URL}/Hand-Out%20-%20A1%20(Ivan%20Banovac).pdf`,
  'Duale Reihe_Searchable.pdf': `${PDFS_BASE_URL}/Duale%20Reihe_Searchable.pdf`,
};

export function getPdfUrlForDoc(doc: string): string | undefined {
  return PDF_URLS[doc];
}

const RENDERED_SLUGS: Record<string, string> = {
  'Skripta A1 ispravljena.pdf': 'skripta_a1',
  'Skripta A2 ispravljena.pdf': 'skripta_a2',
  'Skripta A3 ispravljena.pdf': 'skripta_a3',
  'Hand-Out - A1 (Ivan Banovac).pdf': 'handout_a1',
  'Duale Reihe_Searchable.pdf': 'duale_reihe',
};

export function getRenderedSlug(doc: string): string | undefined {
  if (BUNDLED_DOC_NAMES.has(doc)) return RENDERED_SLUGS[doc];
  if (isLocalDocName(doc)) return localDocNameToSlug(doc);
  return undefined;
}

export interface RenderedMeta {
  total_pages: number;
  pages: { w: number; h: number }[];
}

const renderedMetaCache: Record<string, RenderedMeta> = {};
const renderedMetaPromises: Record<string, Promise<RenderedMeta> | undefined> = {};

export async function loadRenderedMeta(slug: string): Promise<RenderedMeta> {
  const cached = renderedMetaCache[slug];
  if (cached) return cached;
  const inflight = renderedMetaPromises[slug];
  if (inflight) return inflight;
  const p: Promise<RenderedMeta> = isLocalSlug(slug)
    ? loadLocalRenderedMeta(slug).then((d) => {
        renderedMetaCache[slug] = d;
        return d;
      })
    : fetch(`${PDFS_RENDERED_BASE_URL}/${slug}/meta.json`)
        .then((r) => {
          if (!r.ok) throw new Error(`meta.json missing for ${slug}: ${r.status}`);
          return r.json();
        })
        .then((d: RenderedMeta) => {
          renderedMetaCache[slug] = d;
          return d;
        });
  renderedMetaPromises[slug] = p;
  return p;
}

export interface RenderedPageSpan {
  x: number;
  y: number;
  w: number;
  h: number;
  t: string;
}

export interface RenderedPageText {
  w: number;
  h: number;
  s: RenderedPageSpan[];
}

const renderedPageCache: Record<string, RenderedPageText> = {};
const renderedPagePromises: Record<string, Promise<RenderedPageText> | undefined> = {};

export async function loadRenderedPageText(
  slug: string,
  page: number,
): Promise<RenderedPageText> {
  const key = `${slug}/${page}`;
  const cached = renderedPageCache[key];
  if (cached) return cached;
  const inflight = renderedPagePromises[key];
  if (inflight) return inflight;
  const p: Promise<RenderedPageText> = isLocalSlug(slug)
    ? (async () => {
        const [meta, spans] = await Promise.all([
          loadRenderedMeta(slug),
          loadLocalPageSpans(slug, page),
        ]);
        const dim = meta.pages[page - 1] ?? { w: 0, h: 0 };
        const data: RenderedPageText = { w: dim.w, h: dim.h, s: spans };
        renderedPageCache[key] = data;
        return data;
      })()
    : (async () => {
        const padded = String(page).padStart(4, '0');
        const r = await fetch(`${PDFS_RENDERED_BASE_URL}/${slug}/${padded}.json`);
        if (!r.ok) throw new Error(`page text ${slug}/${page} missing: ${r.status}`);
        const data = (await r.json()) as RenderedPageText;
        renderedPageCache[key] = data;
        return data;
      })();
  renderedPagePromises[key] = p;
  return p;
}

export function bundledPageImageUrl(slug: string, page: number): string {
  return `${PDFS_RENDERED_BASE_URL}/${slug}/${String(page).padStart(4, '0')}.webp`;
}

export async function pageImageUrl(slug: string, page: number): Promise<string> {
  if (!isLocalSlug(slug)) {
    return bundledPageImageUrl(slug, page);
  }
  const cached = await loadLocalPageImageBlob(slug, page);
  if (cached) return URL.createObjectURL(cached);
  const { renderLocalPageToBlob } = await import('./localPdfRender');
  const fresh = await renderLocalPageToBlob(slug, page);
  await saveLocalPageImageBlob(slug, page, fresh);
  return URL.createObjectURL(fresh);
}

let bundledDocsCache: PdfDoc[] | null = null;
let bundledDocsPromise: Promise<PdfDoc[]> | null = null;

async function loadBundledDocs(): Promise<PdfDoc[]> {
  if (bundledDocsCache) return bundledDocsCache;
  if (bundledDocsPromise) return bundledDocsPromise;
  bundledDocsPromise = (async () => {
    const docs = await Promise.all(
      BUNDLED_SOURCES.map(async (src) => {
        const res = await fetch(PDF_FILES[src.doc]);
        if (!res.ok) throw new Error(`Failed to load ${src.doc}: ${res.status}`);
        return (await res.json()) as PdfDoc;
      }),
    );
    bundledDocsCache = docs;
    return docs;
  })();
  return bundledDocsPromise;
}

let unifiedCache: UnifiedIndex | null = null;
let unifiedPromise: Promise<UnifiedIndex> | null = null;

export function bumpLocalDocsCache(): void {
  unifiedCache = null;
  unifiedPromise = null;
}

function buildUnified(allDocs: PdfDoc[], sources: SourceMeta[]): UnifiedIndex {
  const index: Record<string, Hit[]> = {};
  const pages: Record<string, string[]> = {};
  const allTermsSet = new Set<string>();
  for (const d of allDocs) {
    const arr: string[] = new Array(d.total_pages).fill('');
    for (const k of Object.keys(d.pages)) {
      const n = Number(k);
      if (!Number.isNaN(n) && n >= 1 && n <= d.total_pages) {
        arr[n - 1] = d.pages[k];
      }
    }
    pages[d.doc_name] = arr;
    for (const term of Object.keys(d.index)) {
      if (!index[term]) index[term] = [];
      for (const hit of d.index[term]) index[term].push(hit);
      allTermsSet.add(term);
    }
  }
  const allTerms = Array.from(allTermsSet).sort((a, b) => a.localeCompare(b));
  return { index, allTerms, pages, sources };
}

export async function loadUnifiedIndex(): Promise<UnifiedIndex> {
  if (unifiedCache) return unifiedCache;
  if (unifiedPromise) return unifiedPromise;
  unifiedPromise = (async () => {
    const [bundled, summaries] = await Promise.all([loadBundledDocs(), listLocalDocs()]);
    const localDocs = await Promise.all(summaries.map((s) => loadLocalPdfDoc(s.slug)));
    const allDocs = [...bundled, ...localDocs];
    const allSources = [...BUNDLED_SOURCES, ...summaries.map((s) => s.sourceMeta)];
    const built = buildUnified(allDocs, allSources);
    unifiedCache = built;
    return built;
  })();
  return unifiedPromise;
}

export function getSourceForDoc(doc: string): SourceMeta | undefined {
  const bundled = BUNDLED_SOURCES.find((s) => s.doc === doc);
  if (bundled) return bundled;
  return unifiedCache?.sources.find((s) => s.doc === doc);
}

export function isBundledDocName(doc: string): boolean {
  return BUNDLED_DOC_NAMES.has(doc);
}

let reviseIndexCache: ReviseGroup[] | null = null;
let reviseIndexPromise: Promise<ReviseGroup[]> | null = null;

export async function loadReviseIndex(): Promise<ReviseGroup[]> {
  if (reviseIndexCache) return reviseIndexCache;
  if (reviseIndexPromise) return reviseIndexPromise;
  reviseIndexPromise = fetch('/data/ponavljanje/index.json')
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load ponavljanje index: ${r.status}`);
      return r.json();
    })
    .then((d: ReviseGroup[]) => {
      reviseIndexCache = d;
      return d;
    });
  return reviseIndexPromise;
}

const reviseTopicCache: Record<string, ReviseTopic | undefined> = {};
const reviseTopicPromises: Record<string, Promise<ReviseTopic> | undefined> = {};

export async function loadReviseTopic(id: string): Promise<ReviseTopic> {
  const cached = reviseTopicCache[id];
  if (cached) return cached;
  const inflight = reviseTopicPromises[id];
  if (inflight) return inflight;
  const p = fetch(`/data/ponavljanje/${id}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Topic not found: ${id}`);
      return r.json();
    })
    .then((d: ReviseTopic) => {
      reviseTopicCache[id] = d;
      return d;
    });
  reviseTopicPromises[id] = p;
  return p;
}

export function fuzzyMatch(query: string, terms: string[], limit = 12): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: string[] = [];
  const contains: string[] = [];
  for (const t of terms) {
    const lc = t.toLowerCase();
    if (lc.startsWith(q)) starts.push(t);
    else if (lc.includes(q)) contains.push(t);
    if (starts.length >= limit) break;
  }
  return [...starts, ...contains].slice(0, limit);
}

export interface ScoredMatch {
  term: string;
  score: number;
}

/** Length-aware version of `fuzzyMatch`. Returns each candidate with a score
 *  in [0, 1] so callers can reject low-confidence substring traps (e.g. the
 *  query "foot bones" silently resolving to "Sesamoid bones of foot").
 *
 *  - 1.00 — exact (case-insensitive) match
 *  - 0.90 — term starts with the query
 *  - q.length / lc.length, capped at 0.85 — query appears as a substring;
 *    score reflects how much of the term the query covers. A 5-char query
 *    inside a 30-char term scores ~0.17 — caller can reject as ambiguous. */
export function fuzzyMatchScored(
  query: string,
  terms: string[],
  limit = 12,
): ScoredMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: ScoredMatch[] = [];
  for (const t of terms) {
    const lc = t.toLowerCase();
    if (lc === q) out.push({ term: t, score: 1 });
    else if (lc.startsWith(q)) out.push({ term: t, score: 0.9 });
    else if (lc.includes(q)) {
      const ratio = q.length / lc.length;
      out.push({ term: t, score: Math.min(ratio, 0.85) });
    }
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
