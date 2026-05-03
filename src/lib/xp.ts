import type { Grade } from './types';

export interface XPState {
  xp: number;
  streak: number;
  lastStudyDate: string; // YYYY-MM-DD
}

const XP_KEY = 'anatom3d.xp.v1';
const BASE_XP: Record<Grade, number> = { wrong: 2, hard: 5, good: 10 };

export function loadXP(): XPState {
  if (typeof localStorage === 'undefined') return { xp: 0, streak: 0, lastStudyDate: '' };
  try {
    const raw = localStorage.getItem(XP_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<XPState>;
      if (typeof p.xp === 'number' && typeof p.streak === 'number') {
        return { xp: p.xp, streak: p.streak, lastStudyDate: p.lastStudyDate ?? '' };
      }
    }
  } catch { /* ignore */ }
  return { xp: 0, streak: 0, lastStudyDate: '' };
}

function saveXP(state: XPState): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(XP_KEY, JSON.stringify(state));
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Cumulative XP needed to reach a given level. Level 1 = 0 XP. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return (level - 1) ** 2 * 50;
}

export function levelFromXP(xp: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1;
}

export interface LevelProgress {
  level: number;
  xpInLevel: number;
  xpNeededForLevel: number;
  pct: number;
}

export function getLevelProgress(xp: number): LevelProgress {
  const level = levelFromXP(xp);
  const start = xpForLevel(level);
  const end = xpForLevel(level + 1);
  const xpInLevel = xp - start;
  const xpNeededForLevel = end - start;
  const pct = xpNeededForLevel > 0 ? Math.round((xpInLevel / xpNeededForLevel) * 100) : 100;
  return { level, xpInLevel, xpNeededForLevel, pct };
}

export function awardXP(grade: Grade): { gained: number; newState: XPState; leveledUp: boolean } {
  const prev = loadXP();
  const today = todayStr();

  let streak = prev.streak;
  if (prev.lastStudyDate !== today) {
    streak = prev.lastStudyDate === yesterdayStr() ? prev.streak + 1 : 1;
  }

  // Streak multiplier: +10% per day, capped at 2x (10-day streak = max)
  const multiplier = Math.min(2, 1 + (streak - 1) * 0.1);
  const gained = Math.round(BASE_XP[grade] * multiplier);
  const newXP = prev.xp + gained;

  const leveledUp = levelFromXP(newXP) > levelFromXP(prev.xp);
  const newState: XPState = { xp: newXP, streak, lastStudyDate: today };
  saveXP(newState);
  return { gained, newState, leveledUp };
}
