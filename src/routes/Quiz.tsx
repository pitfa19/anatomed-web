import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, ChevronRight, Target, Trophy } from 'lucide-react';
import { loadCatalog } from '../lib/viewer/catalog';
import type { PartsCatalog, SystemId } from '../lib/viewer/types';
import { QUIZ_SYSTEMS, buildDeck, loadBestScore } from '../lib/quiz';
import { startQuizSession } from '../lib/quizSession';
import { cn } from '../lib/cn';
import { useT } from '../lib/i18n';

const COUNT_OPTIONS = [5, 10, 20] as const;
type CountOption = (typeof COUNT_OPTIONS)[number];

export default function Quiz() {
  const [catalog, setCatalog] = useState<PartsCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState<CountOption>(10);
  const navigate = useNavigate();
  const t = useT();

  useEffect(() => {
    loadCatalog()
      .then(setCatalog)
      .catch((e) => setError(e.message ?? String(e)));
  }, []);

  // Per-system part counts so we don't show systems with too few options.
  const systemSizes = useMemo(() => {
    if (!catalog) return new Map<SystemId, number>();
    const m = new Map<SystemId, number>();
    for (const sys of catalog.systems) {
      const deck = buildDeck(catalog, { systemId: sys.id, count: 1000, seed: 1 });
      m.set(sys.id, deck.length);
    }
    return m;
  }, [catalog]);

  function startQuiz(systemId: SystemId) {
    if (!catalog) return;
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const cfg = { systemId, count, seed };
    const questions = buildDeck(catalog, cfg);
    if (questions.length === 0) return;
    startQuizSession({ config: cfg, questions, answers: [], currentIdx: 0 });
    navigate('/revise/praksa/play');
  }

  if (error) {
    return <div className="p-6 text-sm text-warn">{t('quiz.catalogError', { error })}</div>;
  }
  if (!catalog) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t('quiz.loadingCatalog')}
      </div>
    );
  }

  const systems = catalog.systems.filter((s) =>
    QUIZ_SYSTEMS.includes(s.id),
  );

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <Link
        to="/revise"
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-strong"
      >
        <ArrowLeft size={12} /> {t('quiz.back')}
      </Link>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-strong">{t('quiz.title')}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {t('quiz.subhead')}
        </p>
      </header>

      <section className="mb-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t('quiz.questionCount')}
        </h2>
        <div className="flex gap-2">
          {COUNT_OPTIONS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={cn(
                'flex-1 rounded-xl border px-4 py-2.5 text-sm font-medium transition-colors',
                count === n
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border bg-surface text-text-muted hover:bg-surface-2 hover:text-text-strong',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {t('quiz.system')}
        </h2>
        <ul className="flex flex-col gap-2">
          {systems.map((sys) => {
            const total = systemSizes.get(sys.id) ?? 0;
            const tooFew = total < count;
            const best = loadBestScore(sys.id, count);
            return (
              <li key={sys.id}>
                <button
                  type="button"
                  disabled={tooFew}
                  onClick={() => startQuiz(sys.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors',
                    tooFew
                      ? 'cursor-not-allowed border-border bg-surface opacity-50'
                      : 'border-border bg-surface hover:border-accent/40 hover:bg-surface-2',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="flex size-10 items-center justify-center rounded-xl"
                      style={{ backgroundColor: sys.tint }}
                      aria-hidden
                    >
                      <Target size={18} className="text-white" />
                    </span>
                    <div>
                      <div className="text-sm font-medium text-text-strong">
                        {sys.label_hr}
                      </div>
                      <div className="text-xs text-text-muted">
                        {tooFew
                          ? t('quiz.tooFewParts', { n: total })
                          : t('quiz.partsAvailable', { n: total })}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {best > 0 && (
                      <span className="flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-[11px] text-text-muted">
                        <Trophy size={11} /> {best}/{count}
                      </span>
                    )}
                    <ChevronRight size={16} className="text-text-muted" />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="mt-6 text-center text-xs text-text-muted">
        {t('quiz.hintBefore')}{' '}
        <Link to="/viewer" className="text-accent hover:underline">
          {t('quiz.hintLink')}
        </Link>
        {t('quiz.hintAfter')}
      </p>
    </div>
  );
}
