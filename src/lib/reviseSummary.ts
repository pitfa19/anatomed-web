import { loadReviseIndex, loadReviseTopic } from './data';
import { dueCountForTopic } from './srs';
import type { ReviseGroup } from './types';

export interface DueSummary {
  /** question count per topic id */
  counts: Record<string, number>;
  /** cards due now per topic id */
  dueCounts: Record<string, number>;
  /** sum of dueCounts across all topics */
  totalDue: number;
}

/**
 * Load every revise topic and compute how many cards are due now, per topic
 * and in total. Shared by the Revision hub (`/revise`, total only) and the
 * theory list (`/revise/teorija`, per-topic badges). `loadReviseTopic` is
 * cached, so calling this on the hub warms the cache for the theory page.
 */
export async function loadDueSummary(groups?: ReviseGroup[]): Promise<DueSummary> {
  const g = groups ?? (await loadReviseIndex());
  const ids = g.flatMap((grp) => grp.topics).map((tp) => tp.id);
  const now = Date.now();
  const counts: Record<string, number> = {};
  const dueCounts: Record<string, number> = {};
  await Promise.all(
    ids.map((id) =>
      loadReviseTopic(id)
        .then((tp) => {
          counts[id] = tp.questions.length;
          dueCounts[id] = dueCountForTopic(id, tp.questions.length, now);
        })
        .catch(() => {
          /* a missing topic just contributes 0 */
        }),
    ),
  );
  const totalDue = Object.values(dueCounts).reduce((s, n) => s + n, 0);
  return { counts, dueCounts, totalDue };
}
