import type { Part, PartsCatalog, SystemId, SystemMeta } from './viewer/types';
import { getSystem } from './viewer/catalog';

export type QuizMode = 'name-part' | 'find-model' | 'which-system' | 'speed';

export interface QuizQuestion {
  mode: QuizMode;
  correct: Part;
  system: SystemMeta;
  /** 4 shuffled parts (includes correct). Used for name-part / find-model / speed. */
  partOptions: Part[];
  /** 4 shuffled systems (includes correct's system). Used for which-system. */
  systemChoices: SystemMeta[];
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Good systems for 3D visual recognition
const VISUAL_SYSTEMS: SystemId[] = ['skeleton', 'muscles', 'organs', 'joints'];
// Systems with readable names for the "which system?" mode
const ALL_QUIZ_SYSTEMS: SystemId[] = ['skeleton', 'muscles', 'nerves', 'vessels', 'organs', 'joints'];

function buildPool(catalog: PartsCatalog, systems: SystemId[]): Part[] {
  // Deduplicate by name_en, preferring .r side (labeled side in viewer)
  const byName = new Map<string, Part>();
  for (const p of catalog.parts) {
    if (!systems.includes(p.system)) continue;
    if (!p.name_en) continue;
    const existing = byName.get(p.name_en);
    if (!existing) {
      byName.set(p.name_en, p);
    } else if (p.side === 'r' && existing.side !== 'r') {
      byName.set(p.name_en, p);
    }
  }
  return Array.from(byName.values());
}

export function generateQuestions(
  catalog: PartsCatalog,
  mode: QuizMode,
  count = 10,
  seed = Date.now(),
): QuizQuestion[] {
  if (catalog.parts.length === 0) return [];
  const rand = mulberry32(seed);

  const systems = mode === 'which-system' ? ALL_QUIZ_SYSTEMS : VISUAL_SYSTEMS;
  const pool = buildPool(catalog, systems);
  if (pool.length < 4) return [];

  const questions: QuizQuestion[] = [];
  const shuffled = shuffle(pool, rand);

  for (const correct of shuffled) {
    if (questions.length >= count) break;

    const system = getSystem(catalog, correct.system);
    if (!system) continue;

    let partOptions: Part[] = [];
    let systemChoices: SystemMeta[] = [];

    if (mode === 'which-system') {
      const others = catalog.systems.filter(
        (s) => s.id !== correct.system && ALL_QUIZ_SYSTEMS.includes(s.id as SystemId),
      );
      const wrong = shuffle(others, rand).slice(0, 3);
      if (wrong.length < 3) continue;
      systemChoices = shuffle([system, ...wrong], rand);
    } else {
      // Wrong options from the SAME system so only 1 GLB loads per question
      const sameSys = pool.filter((p) => p.system === correct.system && p.id !== correct.id);
      const wrong = shuffle(sameSys, rand).slice(0, 3);
      if (wrong.length < 3) {
        // Fallback to other systems
        const fallback = shuffle(
          pool.filter((p) => p.id !== correct.id && !wrong.includes(p)),
          rand,
        ).slice(0, 3 - wrong.length);
        wrong.push(...fallback);
      }
      if (wrong.length < 3) continue;
      partOptions = shuffle([correct, ...wrong], rand);
    }

    questions.push({ mode, correct, system, partOptions, systemChoices });
  }

  return questions;
}
