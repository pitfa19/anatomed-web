import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, BookOpen, Loader2, Sparkles } from 'lucide-react';
import {
  dueCardsForTopic,
  gradeCard,
  intervalDaysForBox,
  loadCard,
  saveCard,
  shuffle,
  type DueCard,
} from '../lib/srs';
import type { Grade, Question, ReviseTopic } from '../lib/types';
import { loadReviseIndex, loadReviseTopic } from '../lib/data';
import GradeButtons from '../components/revise/GradeButtons';
import { cn } from '../lib/cn';
import { useT, plural } from '../lib/i18n';

interface DeckItem {
  topicId: string;
  topicName: string;
  qIndex: number;
  question: Question;
}

const DOC_SLUG_TO_FULL: Record<string, string> = {
  skripta_a1: 'Skripta A1 ispravljena.pdf',
  skripta_a2: 'Skripta A2 ispravljena.pdf',
  skripta_a3: 'Skripta A3 ispravljena.pdf',
  handout_a1: 'Hand-Out - A1 (Ivan Banovac).pdf',
};

const DOC_SLUG_TO_LABEL: Record<string, string> = {
  skripta_a1: 'Skripta A1',
  skripta_a2: 'Skripta A2',
  skripta_a3: 'Skripta A3',
  handout_a1: 'Hand-Out A1',
};

function buildDocsLink(doc: string, page: number, q?: string): string {
  const full = DOC_SLUG_TO_FULL[doc] ?? doc;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('doc', full);
  params.set('page', String(page));
  return `/docs?${params.toString()}`;
}

export default function ReviseToday() {
  const t = useT();
  const [deck, setDeck] = useState<DeckItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [graded, setGraded] = useState(0);
  const [popups, setPopups] = useState<Array<{ id: number; days: number }>>([]);
  const popupRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const index = await loadReviseIndex();
        const topicIds = index.flatMap((g) => g.topics).map((t) => t.id);
        const topics: ReviseTopic[] = await Promise.all(
          topicIds.map((id) => loadReviseTopic(id).catch(() => null as unknown as ReviseTopic)),
        ).then((rs) => rs.filter(Boolean) as ReviseTopic[]);

        const now = Date.now();
        const items: DeckItem[] = [];
        for (const t of topics) {
          const due: DueCard[] = dueCardsForTopic(t.id, t.questions.length, now);
          for (const d of due) {
            items.push({
              topicId: t.id,
              topicName: t.name,
              qIndex: d.qIndex,
              question: t.questions[d.qIndex],
            });
          }
        }
        const shuffled = shuffle(items, now);
        if (!cancelled) {
          setDeck(shuffled);
          setPos(0);
          setRevealed(false);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = useMemo(() => (deck ? deck[pos] : null), [deck, pos]);

  function handleGrade(grade: Grade) {
    if (!current) return;
    const now = Date.now();
    const prev = loadCard(current.topicId, current.qIndex);
    const updated = gradeCard(prev, grade, now);
    saveCard(current.topicId, current.qIndex, updated);

    popupRef.current += 1;
    setPopups((prev) => [...prev, { id: popupRef.current, days: intervalDaysForBox(updated.box) }]);

    setGraded((g) => g + 1);
    setRevealed(false);
    setPos((p) => p + 1);
  }

  if (error) {
    return (
      <div className="p-6 text-sm text-warn">
        {t('revise.error', { error })}{' '}
        <Link to="/revise/teorija" className="underline">
          {t('revise.back').toLowerCase()}
        </Link>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t('decks.loading')}
      </div>
    );
  }

  const total = deck.length;
  const done = pos >= total;

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
        <div className="mb-2 flex items-center justify-between">
          <Link
            to="/revise/teorija"
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-strong"
          >
            <ArrowLeft size={12} /> {t('revise.allTopics')}
          </Link>
        </div>

        <h1 className="text-xl font-semibold text-text-strong">{t('revise.today')}</h1>
        <p className="mt-0.5 text-xs text-text-muted">
          {total === 0
            ? t('revise.noQuestionsDue')
            : t('revise.progressQuestions', {
                done: Math.min(pos, total),
                total,
              })}
        </p>

        {total > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent-2 transition-all"
              style={{ width: `${total === 0 ? 0 : (Math.min(pos, total) / total) * 100}%` }}
            />
          </div>
        )}
      </header>

      <div className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {/* Next-review popups */}
        <div className="pointer-events-none absolute right-6 top-4 z-10 flex flex-col items-end gap-1">
          <AnimatePresence>
            {popups.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 1, y: 0, scale: 1 }}
                animate={{ opacity: 0, y: -28, scale: 0.9 }}
                transition={{ duration: 1.2, ease: 'easeOut' }}
                onAnimationComplete={() =>
                  setPopups((prev) => prev.filter((x) => x.id !== p.id))
                }
                className="flex items-center gap-1 rounded-full bg-accent-2/15 px-3 py-1 text-xs font-medium text-accent-2 shadow-lg"
              >
                {plural(t.lang, p.days, {
                  one: t('revise.nextReviewOne', { n: p.days }),
                  few: t('revise.nextReviewMany', { n: p.days }),
                  many: t('revise.nextReviewMany', { n: p.days }),
                })}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {total === 0 && (
          <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center">
            <Sparkles size={28} className="text-accent-2" />
            <h2 className="text-lg font-semibold text-text-strong">
              {t('revise.allDoneToday')}
            </h2>
            <p className="text-sm text-text-muted">
              {t('revise.nextCardHint')}
            </p>
            <Link
              to="/revise/teorija"
              className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              {t('revise.browseTopics')}
            </Link>
          </div>
        )}

        {done && total > 0 && (
          <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 text-center">
            <Sparkles size={28} className="text-accent-2" />
            <h2 className="text-lg font-semibold text-text-strong">{t('revise.done')}</h2>
            <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface-2/60 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">{t('revise.graded')}</span>
                <span className="font-semibold text-text-strong">
                  {plural(t.lang, graded, {
                    one: t('revise.gradedQuestionsOne', { n: graded }),
                    few: t('revise.gradedQuestionsMany', { n: graded }),
                    many: t('revise.gradedQuestionsMany', { n: graded }),
                  })}
                </span>
              </div>
            </div>
            <Link
              to="/revise/teorija"
              className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
            >
              {t('revise.backToTopics')}
            </Link>
          </div>
        )}

        {!done && current && (
          <article className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-text-muted">
              <Link
                to={`/revise/${current.topicId}`}
                className="rounded-md border border-border bg-surface-2 px-2 py-0.5 hover:border-accent/40 hover:text-text-strong"
              >
                {current.topicName}
              </Link>
              <span>
                {pos + 1} / {total}
              </span>
            </div>
            <h2 className="text-base font-semibold leading-snug text-text-strong">
              {current.question.q}
            </h2>
            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="mt-5 w-full rounded-lg border border-accent/40 bg-accent/10 py-2.5 text-sm font-medium text-accent hover:bg-accent/20"
              >
                {t('revise.showAnswer')}
              </button>
            ) : (
              <div className="mt-4 flex flex-col gap-4">
                <div className="rounded-lg border border-border bg-surface-2/60 p-3 text-sm leading-relaxed text-text">
                  {current.question.a}
                </div>
                {current.question.source && (
                  <Link
                    to={buildDocsLink(
                      current.question.source.doc,
                      current.question.source.page,
                      current.question.source.snippet,
                    )}
                    className={cn(
                      'inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text-muted hover:border-accent/40 hover:text-accent',
                    )}
                  >
                    <BookOpen size={12} />
                    {DOC_SLUG_TO_LABEL[current.question.source.doc] ??
                      current.question.source.doc}
                    {t('revise.sourcePage', { page: current.question.source.page })}
                  </Link>
                )}
                <GradeButtons onGrade={handleGrade} />
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
