import type { CardState, Grade } from './types';

const DAY = 24 * 60 * 60 * 1000;

const NEW_KEY_PREFIX = 'pona.srs.v1';
const LEGACY_KEY_PREFIX = 'pona_';

const BOX_INTERVAL_DAYS: Record<1 | 2 | 3 | 4 | 5, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 14,
  5: 30,
};

/** A card at this Leitner box or higher counts as "known" (weekly+ interval). */
export const KNOWN_BOX = 3;

function newKey(topicId: string, qIndex: number): string {
  return `${NEW_KEY_PREFIX}.${topicId}.${qIndex}`;
}

function legacyKey(topicId: string, qIndex: number): string {
  return `${LEGACY_KEY_PREFIX}${topicId}_q${qIndex}`;
}

export function loadCard(topicId: string, qIndex: number): CardState | null {
  if (typeof localStorage === 'undefined') return null;
  const raw = localStorage.getItem(newKey(topicId, qIndex));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CardState;
    if (
      typeof parsed?.box === 'number' &&
      parsed.box >= 1 &&
      parsed.box <= 5 &&
      typeof parsed.dueAt === 'number'
    ) {
      return parsed;
    }
  } catch {
    // fall through
  }
  return null;
}

export function saveCard(topicId: string, qIndex: number, state: CardState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(newKey(topicId, qIndex), JSON.stringify(state));
}

export function deleteCard(topicId: string, qIndex: number): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(newKey(topicId, qIndex));
  localStorage.removeItem(legacyKey(topicId, qIndex));
}

export function gradeCard(prev: CardState | null, grade: Grade, now = Date.now()): CardState {
  const prevBox = prev?.box ?? 1;
  let nextBox: 1 | 2 | 3 | 4 | 5;
  if (grade === 'wrong') {
    nextBox = 1;
  } else if (grade === 'hard') {
    nextBox = Math.min(3, prevBox + 1) as 1 | 2 | 3 | 4 | 5;
  } else {
    // "I know it" reaches the "known" box on the first grade (matches the
    // "In 7+ days" button hint), then keeps advancing 3 → 4 → 5 on repeats.
    nextBox = Math.min(5, Math.max(prevBox + 1, KNOWN_BOX)) as 1 | 2 | 3 | 4 | 5;
  }
  const dueAt = now + BOX_INTERVAL_DAYS[nextBox] * DAY;
  const history = [...(prev?.history ?? []), { at: now, grade }];
  if (history.length > 20) history.splice(0, history.length - 20);
  return {
    box: nextBox,
    lastReviewedAt: now,
    dueAt,
    history,
  };
}

export function migrateLegacyKey(topicId: string, qIndex: number, now = Date.now()): CardState | null {
  if (typeof localStorage === 'undefined') return null;
  if (loadCard(topicId, qIndex)) return null;
  const legacy = localStorage.getItem(legacyKey(topicId, qIndex));
  if (legacy !== '1') return null;
  const seeded: CardState = {
    box: 2,
    lastReviewedAt: now,
    dueAt: now + 3 * DAY,
    history: [{ at: now, grade: 'good' }],
  };
  saveCard(topicId, qIndex, seeded);
  localStorage.removeItem(legacyKey(topicId, qIndex));
  return seeded;
}

export interface DueCard {
  topicId: string;
  qIndex: number;
  state: CardState | null;
}

export function isDue(state: CardState | null, now = Date.now()): boolean {
  if (!state) return true;
  return state.dueAt <= now;
}

export function dueCardsForTopic(
  topicId: string,
  questionCount: number,
  now = Date.now(),
): DueCard[] {
  const out: DueCard[] = [];
  for (let i = 0; i < questionCount; i++) {
    migrateLegacyKey(topicId, i, now);
    const state = loadCard(topicId, i);
    if (isDue(state, now)) out.push({ topicId, qIndex: i, state });
  }
  return out;
}

export function dueCountForTopic(
  topicId: string,
  questionCount: number,
  now = Date.now(),
): number {
  return dueCardsForTopic(topicId, questionCount, now).length;
}

export interface TopicProgress {
  total: number;
  /** Cards in box >= KNOWN_BOX. */
  known: number;
  /** Cards seen at least once but not yet known. */
  learning: number;
  /** Cards never graded. */
  fresh: number;
  /** Cards due now (orthogonal to known/learning/fresh). */
  due: number;
}

/** Per-topic learning breakdown derived from the stored Leitner boxes. */
export function topicProgress(
  topicId: string,
  questionCount: number,
  now = Date.now(),
): TopicProgress {
  let known = 0;
  let learning = 0;
  let fresh = 0;
  let due = 0;
  for (let i = 0; i < questionCount; i++) {
    migrateLegacyKey(topicId, i, now);
    const state = loadCard(topicId, i);
    if (isDue(state, now)) due++;
    if (!state) fresh++;
    else if (state.box >= KNOWN_BOX) known++;
    else learning++;
  }
  return { total: questionCount, known, learning, fresh, due };
}

/** Days until a card in the given box becomes due again (for "next review"). */
export function intervalDaysForBox(box: 1 | 2 | 3 | 4 | 5): number {
  return BOX_INTERVAL_DAYS[box];
}

export function shuffle<T>(arr: T[], seed = Date.now()): T[] {
  // Mulberry32 deterministic shuffle for stable session order.
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function nextDueAtForTopic(
  topicId: string,
  questionCount: number,
  now = Date.now(),
): number | null {
  let next: number | null = null;
  for (let i = 0; i < questionCount; i++) {
    const state = loadCard(topicId, i);
    if (!state) return now;
    if (state.dueAt <= now) return now;
    if (next === null || state.dueAt < next) next = state.dueAt;
  }
  return next;
}

export function resetTopic(topicId: string, questionCount: number): void {
  for (let i = 0; i < questionCount; i++) {
    deleteCard(topicId, i);
  }
}
