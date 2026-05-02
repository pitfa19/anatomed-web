import { fuzzyMatch } from '../data';
import type { Part, PartsCatalog } from './types';

interface CatalogIndex {
  terms: string[];
  byTerm: Map<string, Part[]>;
}

const CATALOG_INDEX = new WeakMap<PartsCatalog, CatalogIndex>();

/** Common queries whose obvious name doesn't exist verbatim in the catalog
 *  and whose fuzzy fallback would land on something semantically wrong.
 *  The right-hand side is rewritten through the normal exact-match path,
 *  so it must equal a real `name_en` or `name_lat` (case-insensitive).
 *
 *  Example: the catalog has "Renal pelvis" but no standalone "Pelvis".
 *  Without an alias, `focus: "Pelvis"` fuzzy-matches the kidney term. */
const ALIASES: Record<string, string> = {
  pelvis: 'Hip bone',
  'pelvic bone': 'Hip bone',
  'pelvic girdle': 'Hip bone',
  'os pelvis': 'Os coxae',
  zdjelica: 'Hip bone',
  'zdjelična kost': 'Hip bone',
  kuk: 'Hip bone',
  'natkoljenična kost': 'Femur',
  natkoljenica: 'Femur',
  'potkoljenična kost': 'Tibia',
  potkoljenica: 'Tibia',
  'goljenična kost': 'Tibia',
  'lisna kost': 'Fibula',
  iverica: 'Patella',
  'iverica koljena': 'Patella',
  lubanja: 'Skull',
  'palčana kost': 'Radius',
  'lakatna kost': 'Ulna',
  'nadlaktična kost': 'Humerus',
  'ključna kost': 'Clavicle',
  'lopatica': 'Scapula',
  'prsna kost': 'Sternum',
};

function buildIndex(catalog: PartsCatalog): CatalogIndex {
  const cached = CATALOG_INDEX.get(catalog);
  if (cached) return cached;
  const byTerm = new Map<string, Part[]>();
  const terms: string[] = [];
  const seenTerms = new Set<string>();
  const push = (term: string, part: Part) => {
    const trimmed = term?.trim();
    if (!trimmed) return;
    const lc = trimmed.toLowerCase();
    let bucket = byTerm.get(lc);
    if (!bucket) {
      bucket = [];
      byTerm.set(lc, bucket);
    }
    bucket.push(part);
    if (!seenTerms.has(trimmed)) {
      seenTerms.add(trimmed);
      terms.push(trimmed);
    }
  };
  for (const p of catalog.parts) {
    push(p.name_en, p);
    if (p.name_lat) push(p.name_lat, p);
  }
  const idx = { terms, byTerm };
  CATALOG_INDEX.set(catalog, idx);
  return idx;
}

function preferRight(parts: Part[]): Part {
  for (const p of parts) if (p.side === 'r') return p;
  return parts[0]!;
}

export function resolvePartByQuery(
  catalog: PartsCatalog,
  query: string,
): Part | null {
  const trimmed = query.trim();
  if (!trimmed) return null;
  const lc = trimmed.toLowerCase();
  const idx = buildIndex(catalog);

  // Alias rewrite first — must hit an exact catalog name on the right side.
  const aliased = ALIASES[lc];
  if (aliased) {
    const bucket = idx.byTerm.get(aliased.toLowerCase());
    if (bucket && bucket.length > 0) return preferRight(bucket);
  }

  const exact = idx.byTerm.get(lc);
  if (exact && exact.length > 0) return preferRight(exact);

  const fuzzy = fuzzyMatch(trimmed, idx.terms, 5);
  for (const t of fuzzy) {
    const bucket = idx.byTerm.get(t.toLowerCase());
    if (bucket && bucket.length > 0) return preferRight(bucket);
  }
  return null;
}
