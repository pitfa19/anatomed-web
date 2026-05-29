import type { QuizAnswer, QuizConfig, QuizQuestion } from './quiz';

export interface QuizSession {
  config: QuizConfig;
  questions: QuizQuestion[];
  answers: QuizAnswer[];
  currentIdx: number;
}

// v3: each question now isolates the WHOLE region (regionKey + the region's
// full groupMemberIds); v2 was per-sub-group (groupKey).
const KEY = 'anatomed.quiz.session.v3';

interface SerializedQuestion extends Omit<QuizQuestion, 'acceptableIds'> {
  acceptableIds: string[];
}

interface SerializedSession extends Omit<QuizSession, 'questions'> {
  questions: SerializedQuestion[];
}

export function startQuizSession(s: QuizSession): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(serialize(s)));
  } catch {
    /* sessionStorage may be disabled - fall through, the lobby will redirect */
  }
}

export function loadQuizSession(): QuizSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SerializedSession;
    return deserialize(parsed);
  } catch {
    return null;
  }
}

export function clearQuizSession(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

function serialize(s: QuizSession): SerializedSession {
  return {
    ...s,
    questions: s.questions.map((q) => ({
      ...q,
      acceptableIds: Array.from(q.acceptableIds),
    })),
  };
}

function deserialize(s: SerializedSession): QuizSession {
  return {
    ...s,
    questions: s.questions.map((q) => ({
      ...q,
      acceptableIds: new Set(q.acceptableIds),
    })),
  };
}
