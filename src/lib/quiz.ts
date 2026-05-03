import type { Part, PartsCatalog, SystemId } from './viewer/types';

export interface QuizQuestion {
  /** Stable key for React lists. */
  key: string;
  /** Display name shown in the prompt. Latin if available, else English. */
  prompt: string;
  /** Secondary line (English when prompt is Latin, else empty). */
  promptSecondary: string;
  /** Every catalog id that's an acceptable answer (e.g. both `.l` and `.r`).
   *  We accept either side because the user is asked for the bone, not the
   *  laterality. A future "side" mode would split these. */
  acceptableIds: ReadonlySet<string>;
  /** Single id used to render the thumbnail / illustrate the answer in the
   *  results screen. Prefers the `.r` side. */
  canonicalId: string;
}

export interface QuizConfig {
  systemId: SystemId;
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

/** Build a deck of `cfg.count` questions for the chosen system, deterministic
 *  in (seed, system, catalog). Each question groups parts that share an
 *  English+Latin name pair so left/right counterparts collapse into one
 *  acceptable-ids set - the user is asked for the bone, not the laterality. */
export function buildDeck(catalog: PartsCatalog, cfg: QuizConfig): QuizQuestion[] {
  const inSystem = catalog.parts.filter((p) => p.system === cfg.systemId);
  const groups = new Map<string, Part[]>();
  for (const p of inSystem) {
    if (!hasUsableName(p)) continue;
    const groupKey = `${p.name_en}|${p.name_lat ?? ''}`;
    const arr = groups.get(groupKey);
    if (arr) arr.push(p);
    else groups.set(groupKey, [p]);
  }
  const questions: QuizQuestion[] = [];
  for (const [groupKey, parts] of groups) {
    const canonical = parts.find((p) => p.side === 'r') ?? parts[0]!;
    const lat = canonical.name_lat?.trim();
    const en = canonical.name_en.trim();
    const useLat = !!lat && lat.length > 0;
    questions.push({
      key: groupKey,
      prompt: useLat ? lat! : en,
      promptSecondary: useLat && lat !== en ? en : '',
      acceptableIds: new Set(parts.map((p) => p.id)),
      canonicalId: canonical.id,
    });
  }
  shuffleInPlace(questions, cfg.seed);
  return questions.slice(0, cfg.count);
}

/** Drop parts whose names are auto-generated suffixes (e.g. `Axis (C2).001`)
 *  or empty. Without this the deck includes a handful of garbled prompts. */
function hasUsableName(p: Part): boolean {
  const en = p.name_en.trim();
  if (en.length === 0) return false;
  if (/\.\d{3}$/.test(en)) return false;
  return true;
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

function bestScoreKey(systemId: SystemId, count: number): string {
  return `anatomed.quiz.identify.${systemId}.${count}.best`;
}

export function loadBestScore(systemId: SystemId, count: number): number {
  try {
    const v = localStorage.getItem(bestScoreKey(systemId, count));
    if (!v) return 0;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 && n <= count ? n : 0;
  } catch {
    return 0;
  }
}

export function saveBestScore(systemId: SystemId, count: number, score: number): boolean {
  const prev = loadBestScore(systemId, count);
  if (score <= prev) return false;
  try {
    localStorage.setItem(bestScoreKey(systemId, count), String(score));
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

/** Systems that have enough distinct, visually-recognizable parts for an
 *  identify-style quiz. Excludes overlapping/dense systems where clicking the
 *  exact part is luck. */
export const QUIZ_SYSTEMS: readonly SystemId[] = ['skeleton', 'muscles', 'organs'] as const;
