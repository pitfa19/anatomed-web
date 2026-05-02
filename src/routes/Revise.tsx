import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ChevronRight, Sparkles } from 'lucide-react';
import { loadReviseIndex, loadReviseTopic } from '../lib/data';
import type { ReviseGroup } from '../lib/types';
import { dueCountForTopic } from '../lib/srs';
import DueBadge from '../components/revise/DueBadge';
import { cn } from '../lib/cn';

export default function Revise() {
  const [groups, setGroups] = useState<ReviseGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dueCounts, setDueCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    loadReviseIndex()
      .then(setGroups)
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  useEffect(() => {
    if (!groups) return;
    let cancelled = false;
    const ids = groups
      .flatMap((g) => g.topics)
      .filter((t) => t.badge !== 'Quizlet')
      .map((t) => t.id);
    Promise.all(
      ids.map((id) =>
        loadReviseTopic(id)
          .then((t) => ({ id, count: t.questions.length }))
          .catch(() => null),
      ),
    ).then((rs) => {
      if (cancelled) return;
      const cMap: Record<string, number> = {};
      const dMap: Record<string, number> = {};
      const now = Date.now();
      for (const r of rs) {
        if (!r) continue;
        cMap[r.id] = r.count;
        dMap[r.id] = dueCountForTopic(r.id, r.count, now);
      }
      setCounts(cMap);
      setDueCounts(dMap);
    });
    return () => {
      cancelled = true;
    };
  }, [groups]);

  const totalDue = useMemo(
    () => Object.values(dueCounts).reduce((s, n) => s + n, 0),
    [dueCounts],
  );

  if (error) {
    return (
      <div className="p-6 text-sm text-warn">Greška učitavanja: {error}</div>
    );
  }
  if (!groups) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> Učitavam…
      </div>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-strong">Ponavljanje</h1>
        <p className="mt-1 text-sm text-text-muted">
          Pitanja, kratke skripte i Quizlet po temama.
        </p>
      </header>

      {Object.keys(counts).length > 0 && (
        <Link
          to="/revise/today"
          className={cn(
            'mb-6 flex items-center justify-between gap-3 rounded-2xl border p-4 transition-colors',
            totalDue > 0
              ? 'border-accent/40 bg-accent/10 hover:bg-accent/15'
              : 'border-border bg-surface hover:bg-surface-2',
          )}
        >
          <div className="flex items-center gap-3">
            <span
              className={cn(
                'flex size-10 items-center justify-center rounded-xl',
                totalDue > 0
                  ? 'bg-accent text-white'
                  : 'bg-surface-2 text-text-muted',
              )}
            >
              <Sparkles size={18} />
            </span>
            <div>
              <div className="text-sm font-semibold text-text-strong">Danas</div>
              <div className="text-xs text-text-muted">
                {totalDue > 0
                  ? `${totalDue} ${totalDue === 1 ? 'kartica spremna' : 'kartica spremno'} za ponavljanje`
                  : 'Nema kartica na redu — vrati se kasnije'}
              </div>
            </div>
          </div>
          <ChevronRight size={16} className="text-text-muted" />
        </Link>
      )}

      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <section key={g.group}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
              {g.group}
            </h2>
            <ul className="flex flex-col gap-2">
              {g.topics.map((t) => {
                const isQuizletOnly = t.badge === 'Quizlet';
                const due = dueCounts[t.id] ?? 0;
                const Inner = (
                  <div
                    className={cn(
                      'flex items-center justify-between gap-3 rounded-xl border p-3 transition-colors',
                      isQuizletOnly
                        ? 'cursor-not-allowed border-border bg-surface opacity-50'
                        : 'border-border bg-surface hover:border-accent/40 hover:bg-surface-2',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex size-9 items-center justify-center rounded-lg text-[10px] font-semibold text-white',
                          t.badge === 'A1'
                            ? 'bg-accent'
                            : t.badge === 'A1-Auto'
                              ? 'bg-accent/80'
                              : 'bg-accent-2/40',
                        )}
                      >
                        {t.badge}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text-strong">
                            {t.name}
                          </span>
                          {!isQuizletOnly && due > 0 && <DueBadge count={due} />}
                        </div>
                        <div className="text-xs text-text-muted">{t.subtitle}</div>
                      </div>
                    </div>
                    {!isQuizletOnly && (
                      <ChevronRight size={16} className="text-text-muted" />
                    )}
                  </div>
                );
                return (
                  <li key={t.id}>
                    {isQuizletOnly ? (
                      Inner
                    ) : (
                      <Link to={`/revise/${t.id}`}>{Inner}</Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
