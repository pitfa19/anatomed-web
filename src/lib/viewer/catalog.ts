import type { NeighborMap, Part, PartsCatalog, SystemId, SystemMeta } from './types';

const CATALOG_URL = '/models/parts-catalog.json';
const NEIGHBORS_URL = '/models/parts-neighbors.json';

let cache: PartsCatalog | null = null;
let inflight: Promise<PartsCatalog> | null = null;

export async function loadCatalog(): Promise<PartsCatalog> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const r = await fetch(CATALOG_URL);
    if (!r.ok) throw new Error(`parts-catalog.json missing: ${r.status}`);
    const data = (await r.json()) as PartsCatalog;
    cache = data;
    return data;
  })();
  return inflight;
}

let neighborsCache: NeighborMap | null = null;
let neighborsInflight: Promise<NeighborMap> | null = null;

export async function loadNeighbors(): Promise<NeighborMap> {
  if (neighborsCache) return neighborsCache;
  if (neighborsInflight) return neighborsInflight;
  neighborsInflight = (async () => {
    const r = await fetch(NEIGHBORS_URL);
    if (!r.ok) throw new Error(`parts-neighbors.json missing: ${r.status}`);
    const data = (await r.json()) as NeighborMap;
    neighborsCache = data;
    return data;
  })();
  return neighborsInflight;
}

export function partSearchTerms(catalog: PartsCatalog): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of catalog.parts) {
    const en = formatTerm(p);
    if (!seen.has(en)) {
      seen.add(en);
      out.push(en);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function formatTerm(p: Part): string {
  if (p.name_lat && p.name_lat !== p.name_en) {
    return `${p.name_en} · ${p.name_lat}`;
  }
  return p.name_en;
}

export function findPartByTerm(catalog: PartsCatalog, term: string): Part | null {
  let match: Part | null = null;
  for (const p of catalog.parts) {
    if (formatTerm(p) !== term) continue;
    if (!match) {
      match = p;
      continue;
    }
    if (p.side === 'r' && match.side !== 'r') match = p;
  }
  return match;
}

export function getSystem(catalog: PartsCatalog, id: SystemId): SystemMeta | null {
  return catalog.systems.find((s) => s.id === id) ?? null;
}

/** Cross-app lookup used to wire `/docs` search hits to a 3D part. Matches on
 *  English or Latin name, case-insensitive, exact only - anything fuzzier
 *  produces too many false positives (e.g. "femur" matching every -line). */
export function findCatalogPartByTermAnyCase(
  catalog: PartsCatalog,
  term: string,
): Part | null {
  const lc = term.trim().toLowerCase();
  if (!lc) return null;
  let match: Part | null = null;
  for (const p of catalog.parts) {
    if (p.name_en.toLowerCase() !== lc && p.name_lat?.toLowerCase() !== lc) continue;
    if (!match) {
      match = p;
      continue;
    }
    // Same .r preference as findPartByTerm so cross-links land on the labeled side.
    if (p.side === 'r' && match.side !== 'r') match = p;
  }
  return match;
}
