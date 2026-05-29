import { loadReviseIndex, loadReviseTopic } from './data';
import { topicProgress, type TopicProgress } from './srs';
import type { ReviseGroup } from './types';

export interface DueSummary {
  /** question count per topic id */
  counts: Record<string, number>;
  /** cards due now per topic id */
  dueCounts: Record<string, number>;
  /** learning breakdown per topic id (known/learning/fresh/due/total) */
  progress: Record<string, TopicProgress>;
  /** summed breakdown across all topics */
  totals: TopicProgress;
  /** sum of dueCounts across all topics */
  totalDue: number;
}

const EMPTY: TopicProgress = { total: 0, known: 0, learning: 0, fresh: 0, due: 0 };

/**
 * Load every revise topic and compute its learning breakdown (known / learning
 * / fresh / due) from the stored Leitner boxes, per topic and summed. Shared by
 * the Revision hub (`/revise`, totals only) and the theory list
 * (`/revise/teorija`, per-topic bars). `loadReviseTopic` is cached, so calling
 * this on the hub warms the cache for the theory page.
 */
export async function loadDueSummary(groups?: ReviseGroup[]): Promise<DueSummary> {
  const g = groups ?? (await loadReviseIndex());
  const ids = g.flatMap((grp) => grp.topics).map((tp) => tp.id);
  const now = Date.now();
  const counts: Record<string, number> = {};
  const dueCounts: Record<string, number> = {};
  const progress: Record<string, TopicProgress> = {};
  await Promise.all(
    ids.map((id) =>
      loadReviseTopic(id)
        .then((tp) => {
          const p = topicProgress(id, tp.questions.length, now);
          progress[id] = p;
          counts[id] = p.total;
          dueCounts[id] = p.due;
        })
        .catch(() => {
          /* a missing topic just contributes 0 */
        }),
    ),
  );
  const totals = Object.values(progress).reduce(
    (acc, p) => ({
      total: acc.total + p.total,
      known: acc.known + p.known,
      learning: acc.learning + p.learning,
      fresh: acc.fresh + p.fresh,
      due: acc.due + p.due,
    }),
    { ...EMPTY },
  );
  return { counts, dueCounts, progress, totals, totalDue: totals.due };
}
