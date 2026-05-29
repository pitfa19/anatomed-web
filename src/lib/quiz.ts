import { resolveQueryToParts } from './viewer/resolveParts';
import type { Part, PartsCatalog } from './viewer/types';

/** Lobby regions. Each maps to one or more anatomical groups; "mixed" draws
 *  from all of them. Skeleton-only for now (the only system with grouping). */
export type QuizRegion = 'hand' | 'foot' | 'spine' | 'skull' | 'mixed';

export const QUIZ_REGIONS: readonly QuizRegion[] = [
  'hand',
  'foot',
  'spine',
  'skull',
  'mixed',
] as const;

/** Regions that map to a concrete anatomical structure (everything except the
 *  "mixed" meta-region). */
export type QuizBaseRegion = Exclude<QuizRegion, 'mixed'>;

/** Each region is shown WHOLE (the entire hand & wrist, foot, spine, or skull)
 *  and the player clicks one element within it - the full structure is
 *  recognizable enough to locate a single bone precisely. The strings are
 *  group aliases understood by `resolveQueryToParts` (see GROUP_SPECS in
 *  `viewer/resolveParts.ts`); a region's membership is the union of its
 *  groups. */
const REGION_GROUPS: Record<QuizBaseRegion, readonly string[]> = {
  hand: ['carpus', 'metacarpus', 'phalanges of hand'],
  foot: ['tarsus', 'metatarsus', 'phalanges of foot'],
  // The vertebral column includes the sacrum and coccyx; 'sacrum'/'coccyx'
  // resolve to single midline bones via resolveQueryToParts.
  spine: ['cervical spine', 'thoracic spine', 'lumbar spine', 'sacrum', 'coccyx'],
  skull: ['neurocranium', 'viscerocranium'],
};

const BASE_REGIONS: readonly QuizBaseRegion[] = ['hand', 'foot', 'spine', 'skull'];

/** Regions rendered with BOTH sides of paired bones. A hand or foot is a single
 *  limb (one of each bone), but the skull is one midline structure built from
 *  left+right pairs - showing only the right half renders a lopsided skull. */
const BOTH_SIDES_REGIONS: ReadonlySet<QuizBaseRegion> = new Set(['skull']);

export interface QuizQuestion {
  /** Stable key for React lists. */
  key: string;
  /** The region this question lives in (context label). */
  regionKey: QuizBaseRegion;
  /** Catalog ids of every part rendered for this question - the WHOLE region
   *  (hand/foot/spine/skull). One per name for limbs/spine; both left+right for
   *  the skull's paired bones. The scene isolates exactly these, so the player
   *  picks the asked-for bone within the full structure. */
  groupMemberIds: string[];
  /** Display name shown in the prompt. Latin if available, else English. */
  prompt: string;
  /** Secondary line (English when prompt is Latin, else empty). */
  promptSecondary: string;
  /** Acceptable answer ids: the target plus its left/right mirror, so a click
   *  on either side counts (we render the canonical/right side). */
  acceptableIds: ReadonlySet<string>;
  /** Single id used to highlight the answer on reveal + render the results
   *  thumbnail. */
  canonicalId: string;
}

export interface QuizConfig {
  region: QuizRegion;
  count: number;
  /** Stable random seed for the deck (reset on retry). */
  seed: number;
}

export interface QuizAnswer {
  questionKey: string;
  /** Catalog id the user clicked, or null if they skipped. */
  pickedId: string | null;
  correct: boolean;
}

/** A region needs at least this many members to make a meaningful
 *  "find one among several" question. */
const MIN_REGION_MEMBERS = 2;

/** All distinct parts that make up a region - the union of its groups,
 *  de-duplicated by id and filtered to usable names (one per name, right side
 *  preferred via `resolveQueryToParts`). */
function regionMembers(catalog: PartsCatalog, region: QuizBaseRegion): Part[] {
  const seen = new Set<string>();
  const out: Part[] = [];
  for (const alias of REGION_GROUPS[region]) {
    const resolved = resolveQueryToParts(catalog, alias);
    if (!resolved) continue;
    for (const p of resolved.parts) {
      if (!hasUsableName(p) || seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

/** Catalog ids to render for a region. Normally that's just the (one-per-name,
 *  right-side) members; for a both-sides region (skull) it also pulls in each
 *  bone's left/right mirror so the whole structure renders, not a half. */
function renderIds(
  catalog: PartsCatalog,
  members: Part[],
  bothSides: boolean,
): string[] {
  if (!bothSides) return members.map((p) => p.id);
  const byName = new Map<string, Part[]>();
  for (const p of catalog.parts) {
    const arr = byName.get(p.name_en);
    if (arr) arr.push(p);
    else byName.set(p.name_en, [p]);
  }
  const ids = new Set<string>();
  for (const m of members) {
    for (const sib of byName.get(m.name_en) ?? [m]) ids.add(sib.id);
  }
  return [...ids];
}

/** Build a deck of `cfg.count` questions, deterministic in (seed, region,
 *  catalog). Every question shows the WHOLE region it belongs to and asks for
 *  one element inside it; "mixed" interleaves all four regions. */
export function buildDeck(catalog: PartsCatalog, cfg: QuizConfig): QuizQuestion[] {
  const regions = cfg.region === 'mixed' ? BASE_REGIONS : [cfg.region];
  const candidates: QuizQuestion[] = [];
  for (const region of regions) {
    const members = regionMembers(catalog, region);
    if (members.length < MIN_REGION_MEMBERS) continue;
    const memberIds = renderIds(catalog, members, BOTH_SIDES_REGIONS.has(region));
    for (const target of members) {
      const lat = target.name_lat?.trim();
      const en = cleanName(target.name_en);
      const useLat = !!lat && lat.length > 0;
      candidates.push({
        key: `${region}|${target.id}`,
        regionKey: region,
        groupMemberIds: memberIds,
        prompt: useLat ? lat! : en,
        promptSecondary: useLat && lat !== en ? en : '',
        acceptableIds: new Set(siblingIds(target.id)),
        canonicalId: target.id,
      });
    }
  }
  shuffleInPlace(candidates, cfg.seed);
  return candidates.slice(0, cfg.count);
}

/** A part id and its left/right mirror. We render the canonical (right) side,
 *  but accept either id in case the opposite side is also clickable. */
function siblingIds(id: string): string[] {
  if (id.endsWith('.r')) return [id, id.slice(0, -2) + '.l'];
  if (id.endsWith('.l')) return [id, id.slice(0, -2) + '.r'];
  return [id];
}

/** Strip a trailing Blender duplicate suffix (".001") for display. Most ".NNN"
 *  names are throwaway duplicates, but a few are the ONLY copy of a real bone -
 *  notably the axis, stored as "Axis (C2).001". We keep such bones (see
 *  `hasUsableName`) and just clean the label. */
function cleanName(name: string): string {
  return name.replace(/\.\d{3}$/, '').trim();
}

/** Drop parts with empty names. (We deliberately keep ".NNN"-suffixed names
 *  like "Axis (C2).001" - within the quiz regions the only such bone is the
 *  axis, a real vertebra, not a duplicate - and clean the label via
 *  `cleanName`.) */
function hasUsableName(p: Part): boolean {
  return cleanName(p.name_en).length > 0;
}

/** Mulberry32 - small, deterministic, good enough for shuffling a quiz deck. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleInPlace<T>(arr: T[], seed: number): void {
  const r = rng(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

export function gradeAnswer(q: QuizQuestion, pickedId: string | null): QuizAnswer {
  return {
    questionKey: q.key,
    pickedId,
    correct: pickedId !== null && q.acceptableIds.has(pickedId),
  };
}

function bestScoreKey(region: QuizRegion, count: number): string {
  return `anatomed.quiz.identify.${region}.${count}.best`;
}

export function loadBestScore(region: QuizRegion, count: number): number {
  try {
    const v = localStorage.getItem(bestScoreKey(region, count));
    if (!v) return 0;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 && n <= count ? n : 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(region: QuizRegion, count: number, score: number): boolean {
  const prev = loadBestScore(region, count);
  if (score <= prev) return false;
  try {
    localStorage.setItem(bestScoreKey(region, count), String(score));
    return true;
  } catch {
    return false;
  }
}

const THUMBS_BASE_URL = (import.meta.env.VITE_THUMBS_BASE_URL ?? '/models/thumbs').replace(/\/$/, '');

/** Path to the precomputed thumbnail rendered by tools/render_part_thumbnails.py.
 *  Filename mirrors three.js's `PropertyBinding.sanitizeNodeName` so it lines
 *  up with the GLB node name. With VITE_THUMBS_BASE_URL set the request hits
 *  the Supabase `thumbs` bucket; without it falls back to a static
 *  `/models/thumbs/...` path under public/. Missing renders surface as a
 *  broken `<img>` - callers should provide a fallback (e.g. <PartPreview>). */
export function thumbnailUrl(canonicalId: string): string {
  return `${THUMBS_BASE_URL}/${sanitizeId(canonicalId)}.png`;
}

function sanitizeId(id: string): string {
  return id.replace(/\s/g, '_').replace(/[^\w-]/g, '');
}
