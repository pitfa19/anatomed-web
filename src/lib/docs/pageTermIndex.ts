import type { UnifiedIndex } from '../types';
import type { PartsCatalog } from '../viewer/types';
import { findCatalogPartByTermAnyCase } from '../viewer/catalog';

type PerDoc = Record<string, Record<number, string[]>>;
type MatchPagesPerDoc = Record<string, number[]>;

const cache = new WeakMap<UnifiedIndex, PerDoc>();
const matchPagesCache = new WeakMap<UnifiedIndex, WeakMap<PartsCatalog, MatchPagesPerDoc>>();

function buildPerDoc(unified: UnifiedIndex): PerDoc {
  const out: PerDoc = {};
  for (const [term, hits] of Object.entries(unified.index)) {
    for (const h of hits) {
      // Only keep word-boundary matches. Substring hits (e.g. "pons" inside
      // "preponska") are false positives in any Croatian context and would
      // pollute the panel.
      if (!h.exact) continue;
      const d = (out[h.doc] ??= {});
      const arr = (d[h.page] ??= []);
      if (!arr.includes(term)) arr.push(term);
    }
  }
  for (const d of Object.values(out)) {
    for (const k of Object.keys(d)) {
      d[Number(k)].sort((a, b) => a.localeCompare(b, 'hr'));
    }
  }
  return out;
}

export function getTermsForPage(
  unified: UnifiedIndex,
  doc: string,
  page: number,
): string[] {
  let perDoc = cache.get(unified);
  if (!perDoc) {
    perDoc = buildPerDoc(unified);
    cache.set(unified, perDoc);
  }
  return perDoc[doc]?.[page] ?? [];
}

function buildMatchPages(
  unified: UnifiedIndex,
  catalog: PartsCatalog,
): MatchPagesPerDoc {
  const sets: Record<string, Set<number>> = {};
  for (const [term, hits] of Object.entries(unified.index)) {
    if (!findCatalogPartByTermAnyCase(catalog, term)) continue;
    for (const h of hits) {
      if (!h.exact) continue;
      (sets[h.doc] ??= new Set()).add(h.page);
    }
  }
  const out: MatchPagesPerDoc = {};
  for (const [doc, set] of Object.entries(sets)) {
    out[doc] = [...set].sort((a, b) => a - b);
  }
  return out;
}

function getMatchPages(
  unified: UnifiedIndex,
  catalog: PartsCatalog,
): MatchPagesPerDoc {
  let perCatalog = matchPagesCache.get(unified);
  if (!perCatalog) {
    perCatalog = new WeakMap();
    matchPagesCache.set(unified, perCatalog);
  }
  let perDoc = perCatalog.get(catalog);
  if (!perDoc) {
    perDoc = buildMatchPages(unified, catalog);
    perCatalog.set(catalog, perDoc);
  }
  return perDoc;
}

export function nextPageWithCatalogMatch(
  unified: UnifiedIndex,
  catalog: PartsCatalog,
  doc: string,
  fromPage: number,
): number | null {
  const sorted = getMatchPages(unified, catalog)[doc] ?? [];
  if (sorted.length === 0) return null;
  let lo = 0;
  let hi = sorted.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! > fromPage) {
      ans = mid;
      hi = mid - 1;
    } else {
      lo = mid + 1;
    }
  }
  return ans === -1 ? null : sorted[ans]!;
}

export function docHasAnyCatalogMatch(
  unified: UnifiedIndex,
  catalog: PartsCatalog,
  doc: string,
): boolean {
  return (getMatchPages(unified, catalog)[doc] ?? []).length > 0;
}
