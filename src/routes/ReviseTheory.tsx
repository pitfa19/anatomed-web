import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, ChevronRight, Sparkles, Layers, Plus } from 'lucide-react';
import { loadReviseIndex, loadReviseTopic } from '../lib/data';
import type { ReviseGroup } from '../lib/types';
import { dueCountForTopic } from '../lib/srs';
import { loadXP, type XPState } from '../lib/xp';
import { loadDecks, dueCardsForUserDeck } from '../lib/userDecks';
import DueBadge from '../components/revise/DueBadge';
import XPBar from '../components/revise/XPBar';
import { cn } from '../lib/cn';
import { useT, plural } from '../lib/i18n';

export default function ReviseTheory() {
  const t = useT();
  const [groups, setGroups] = useState<ReviseGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [dueCounts, setDueCounts] = useState<Record<string, number>>({});
  const [xpState, setXPState] = useState<XPState>(() => loadXP());

  const userDecks = loadDecks();
  const userDecksDue = useMemo(() => {
    const now = Date.now();
    return userDecks.reduce((sum, d) => sum + dueCardsForUserDeck(d, now).length, 0);
  }, [userDecks]);

  useEffect(() => {
    setXPState(loadXP());
    loadReviseIndex()
      .then(setGroups)
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  useEffect(() => {
    if (!groups) return;
    let cancelled = false;
    const ids = groups.flatMap((g) => g.topics).map((t) => t.id);
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
      <div className="p-6 text-sm text-warn">{t('revise.loadError', { error })}</div>
    );
  }
  if (!groups) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t('revise.loading')}
      </div>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <Link
        to="/revise"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-strong"
      >
        <ArrowLeft size={12} /> {t('revise.back')}
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-strong">{t('revise.theoryTitle')}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {t('revise.theorySubhead')}
        </p>
      </header>

      {/* XP progress bar */}
      <XPBar state={xpState} className="mb-4" />

      {/* Today's review */}
      {Object.keys(counts).length > 0 && (
        <Link
          to="/revise/today"
          className={cn(
            'mb-3 flex items-center justify-between gap-3 rounded-2xl border p-4 transition-colors',
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
              <div className="text-sm font-semibold text-text-strong">{t('revise.today')}</div>
              <div className="text-xs text-text-muted">
                {totalDue > 0
                  ? plural(t.lang, totalDue, {
                      one: t('revise.cardsReadyOne', { n: totalDue }),
                      few: t('revise.cardsReadyMany', { n: totalDue }),
                      many: t('revise.cardsReadyMany', { n: totalDue }),
                    })
                  : t('revise.noCardsDue')}
              </div>
            </div>
          </div>
          <ChevronRight size={16} className="text-text-muted" />
        </Link>
      )}

      {/* My decks */}
      <Link
        to="/revise/my-decks"
        className={cn(
          'mb-6 flex items-center justify-between gap-3 rounded-2xl border p-4 transition-colors',
          userDecksDue > 0
            ? 'border-accent-2/40 bg-accent-2/10 hover:bg-accent-2/15'
            : 'border-border bg-surface hover:bg-surface-2',
        )}
      >
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex size-10 items-center justify-center rounded-xl',
              userDecksDue > 0
                ? 'bg-accent-2 text-white'
                : 'bg-surface-2 text-text-muted',
            )}
          >
            <Layers size={18} />
          </span>
          <div>
            <div className="text-sm font-semibold text-text-strong">{t('revise.myDecks')}</div>
            <div className="text-xs text-text-muted">
              {userDecks.length === 0
                ? t('revise.myDecksEmptyHint')
                : userDecksDue > 0
                  ? t('revise.deckCountDue', {
                      due: userDecksDue,
                      decks: userDecks.length,
                      unit: plural(t.lang, userDecks.length, { one: t('revise.packageOne'), few: t('revise.packageMany'), many: t('revise.packageMany') }),
                    })
                  : t('revise.deckCount', {
                      decks: userDecks.length,
                      unit: plural(t.lang, userDecks.length, { one: t('revise.packageOne'), few: t('revise.packageMany'), many: t('revise.packageMany') }),
                    })}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {userDecks.length === 0 && (
            <span className="flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-[10px] text-text-muted">
              <Plus size={10} /> {t('revise.new')}
            </span>
          )}
          <ChevronRight size={16} className="text-text-muted" />
        </div>
      </Link>

      <div className="flex flex-col gap-6">
        {groups.map((g) => (
          <section key={g.group}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
              {g.group}
            </h2>
            <ul className="flex flex-col gap-2">
              {g.topics.map((t) => {
                const due = dueCounts[t.id] ?? 0;
                return (
                  <li key={t.id}>
                    <Link to={`/revise/${t.id}`}>
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3 transition-colors hover:border-accent/40 hover:bg-surface-2">
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
                              {due > 0 && <DueBadge count={due} />}
                            </div>
                            <div className="text-xs text-text-muted">{t.subtitle}</div>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-text-muted" />
                      </div>
                    </Link>
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
