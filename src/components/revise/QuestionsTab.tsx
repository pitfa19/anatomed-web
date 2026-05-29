import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronDown, RotateCcw, CheckCircle2, BookOpen } from 'lucide-react';
import type { CardState, Grade, Question } from '../../lib/types';
import { cn } from '../../lib/cn';
import {
  gradeCard,
  isDue,
  loadCard,
  migrateLegacyKey,
  resetTopic,
  saveCard,
} from '../../lib/srs';
import { awardXP } from '../../lib/xp';
import GradeButtons from './GradeButtons';
import { useT } from '../../lib/i18n';

interface Props {
  topicId: string;
  questions: Question[];
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

export default function QuestionsTab({ topicId, questions }: Props) {
  const t = useT();
  const [searchParams] = useSearchParams();
  const dueOnly = searchParams.get('due') === '1';

  const [cards, setCards] = useState<Record<number, CardState | null>>({});
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [tick, setTick] = useState(0); // forces re-eval of dueOnly filter after grading

  useEffect(() => {
    const now = Date.now();
    const map: Record<number, CardState | null> = {};
    for (let i = 0; i < questions.length; i++) {
      migrateLegacyKey(topicId, i, now);
      map[i] = loadCard(topicId, i);
    }
    setCards(map);
    setExpanded({});
    setTick(0);
  }, [topicId, questions]);

  function toggle(i: number) {
    setExpanded((e) => ({ ...e, [i]: !e[i] }));
  }

  function onGrade(i: number, grade: Grade) {
    const now = Date.now();
    const next = gradeCard(cards[i] ?? null, grade, now);
    saveCard(topicId, i, next);
    awardXP(grade);
    setCards((prev) => ({ ...prev, [i]: next }));
    setExpanded((prev) => ({ ...prev, [i]: false }));
    setTick((t) => t + 1);
  }

  function reset() {
    resetTopic(topicId, questions.length);
    const empty: Record<number, CardState | null> = {};
    for (let i = 0; i < questions.length; i++) empty[i] = null;
    setCards(empty);
    setExpanded({});
    setTick((t) => t + 1);
  }

  const visibleIndexes = useMemo(() => {
    const out: number[] = [];
    const now = Date.now();
    for (let i = 0; i < questions.length; i++) {
      if (!dueOnly || isDue(cards[i] ?? null, now)) out.push(i);
    }
    return out;
    // tick forces recompute after grading so a just-graded card drops out of dueOnly view
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions.length, dueOnly, cards, tick]);

  const learned = useMemo(
    () => Object.values(cards).filter((c) => c && c.box >= 3).length,
    [cards],
  );
  const seen = useMemo(
    () => Object.values(cards).filter((c) => c !== null).length,
    [cards],
  );
  const pct =
    questions.length > 0 ? Math.round((learned / questions.length) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-surface p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <CheckCircle2 size={15} className="text-accent-2" />
            <span className="text-text-strong">{learned}</span>
            <span className="text-text-muted">/ {questions.length} {t('revise.learned')}</span>
            {seen > learned && (
              <span className="ml-2 text-xs text-text-muted">· {t('revise.seen', { n: seen })}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {dueOnly && (
              <Link
                to={`/revise/${topicId}`}
                className="text-xs text-accent hover:underline"
              >
                {t('revise.allQuestions')}
              </Link>
            )}
            <button
              onClick={reset}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-2 hover:text-text-strong"
            >
              <RotateCcw size={12} /> {t('revise.reset')}
            </button>
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent-2 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      {dueOnly && visibleIndexes.length === 0 && questions.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4 text-center text-sm text-text-muted">
          {t('revise.noQuestionsDueForTopic')}{' '}
          <Link to={`/revise/${topicId}`} className="text-accent hover:underline">
            {t('revise.viewAllQuestions')}
          </Link>
          .
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {visibleIndexes.map((i) => {
          const q = questions[i];
          const isOpen = !!expanded[i];
          const card = cards[i] ?? null;
          const box = card?.box ?? 0;
          return (
            <li
              key={i}
              className={cn(
                'rounded-xl border bg-surface',
                isOpen ? 'border-accent/40' : 'border-border',
              )}
            >
              <button
                onClick={() => toggle(i)}
                className="flex w-full items-start gap-3 p-3 text-left"
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    box >= 3
                      ? 'bg-accent-2/20 text-accent-2'
                      : box >= 1
                        ? 'bg-accent/15 text-accent'
                        : 'bg-surface-2 text-text-muted',
                  )}
                  aria-label={box ? t('revise.questionLevel', { box }) : t('revise.newQuestion')}
                >
                  {box || i + 1}
                </span>
                <span className="flex-1 text-sm font-medium text-text-strong">{q.q}</span>
                <ChevronDown
                  size={16}
                  className={cn(
                    'mt-1 shrink-0 text-text-muted transition-transform',
                    isOpen && 'rotate-180',
                  )}
                />
              </button>
              {isOpen && (
                <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
                  <div className="text-sm leading-relaxed text-text">{q.a}</div>
                  {q.source && (
                    <Link
                      to={buildDocsLink(q.source.doc, q.source.page, q.source.snippet)}
                      className="inline-flex w-fit items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-text-muted hover:border-accent/40 hover:text-accent"
                    >
                      <BookOpen size={12} />
                      {DOC_SLUG_TO_LABEL[q.source.doc] ?? q.source.doc}{t('revise.sourcePage', { page: q.source.page })}
                    </Link>
                  )}
                  <GradeButtons onGrade={(g) => onGrade(i, g)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
