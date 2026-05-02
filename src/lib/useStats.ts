import { useEffect, useState } from 'react';
import { loadReviseIndex, loadUnifiedIndex } from './data';

export interface HomeStats {
  pages: number;
  sources: number;
  terms: number;
  topics: number;
  loading: boolean;
}

const initial: HomeStats = {
  pages: 0,
  sources: 0,
  terms: 0,
  topics: 0,
  loading: true,
};

let cache: HomeStats | null = null;

export function useStats(): HomeStats {
  const [stats, setStats] = useState<HomeStats>(cache ?? initial);

  useEffect(() => {
    if (cache) {
      setStats(cache);
      return;
    }
    let cancelled = false;
    Promise.all([loadUnifiedIndex(), loadReviseIndex().catch(() => [])])
      .then(([unified, revise]) => {
        if (cancelled) return;
        let pages = 0;
        for (const src of unified.sources) {
          pages += unified.pages[src.doc]?.length ?? 0;
        }
        const topics = Array.isArray(revise)
          ? revise.reduce((n, g) => n + (g.topics?.length ?? 0), 0)
          : 0;
        const next: HomeStats = {
          pages,
          sources: unified.sources.length,
          terms: unified.allTerms.length,
          topics,
          loading: false,
        };
        cache = next;
        setStats(next);
      })
      .catch(() => {
        if (cancelled) return;
        const fallback: HomeStats = { ...initial, loading: false };
        cache = fallback;
        setStats(fallback);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return stats;
}
