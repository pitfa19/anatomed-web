import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, X as XIcon, RotateCcw, ChevronRight, Loader2, Trophy } from 'lucide-react';
import { loadCatalog, getSystem } from '../lib/viewer/catalog';
import type { Part, PartsCatalog, SystemMeta } from '../lib/viewer/types';
import { saveBestScore, thumbnailUrl, type QuizQuestion } from '../lib/quiz';
import {
  clearQuizSession,
  loadQuizSession,
  startQuizSession,
  type QuizSession,
} from '../lib/quizSession';
import { buildDeck } from '../lib/quiz';
import { cn } from '../lib/cn';
import { useT } from '../lib/i18n';
import type { TFn } from '../lib/i18n';

export default function QuizResults() {
  const navigate = useNavigate();
  const [catalog, setCatalog] = useState<PartsCatalog | null>(null);
  const [session] = useState<QuizSession | null>(() => loadQuizSession());
  const [isNewBest, setIsNewBest] = useState(false);
  const t = useT();

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(() => {});
  }, []);

  // Empty / refreshed-into state - bounce.
  useEffect(() => {
    if (!session || session.answers.length === 0) {
      navigate('/revise/praksa', { replace: true });
    }
  }, [session, navigate]);

  // Persist best score once on mount.
  useEffect(() => {
    if (!session) return;
    const correct = session.answers.filter((a) => a.correct).length;
    const beat = saveBestScore(session.config.systemId, session.config.count, correct);
    setIsNewBest(beat);
  }, [session]);

  const system: SystemMeta | null = useMemo(() => {
    if (!catalog || !session) return null;
    return getSystem(catalog, session.config.systemId);
  }, [catalog, session]);

  function retry() {
    if (!catalog || !session) return;
    const seed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
    const cfg = { ...session.config, seed };
    const questions = buildDeck(catalog, cfg);
    if (questions.length === 0) return;
    startQuizSession({ config: cfg, questions, answers: [], currentIdx: 0 });
    navigate('/revise/praksa/play');
  }

  function backToLobby() {
    clearQuizSession();
    navigate('/revise/praksa');
  }

  if (!session || !catalog || !system) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t('quiz.loading')}
      </div>
    );
  }

  const correct = session.answers.filter((a) => a.correct).length;
  const total = session.questions.length;
  const pct = Math.round((correct / total) * 100);
  const partsById = new Map<string, Part>();
  for (const p of catalog.parts) partsById.set(p.id, p);

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-col items-center gap-2 text-center">
        <span
          className={cn(
            'flex size-16 items-center justify-center rounded-full',
            pct >= 80
              ? 'bg-emerald-500/15 text-emerald-500'
              : pct >= 50
                ? 'bg-accent/15 text-accent'
                : 'bg-surface text-text-muted',
          )}
        >
          <Trophy size={28} />
        </span>
        <h1 className="text-3xl font-semibold tracking-tight text-text-strong">
          {correct} / {total}
        </h1>
        <p className="text-sm text-text-muted">
          {system.label_hr} · {t('quiz.percentCorrect', { pct })}
          {isNewBest && (
            <span className="ml-2 rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
              {t('quiz.newBest')}
            </span>
          )}
        </p>
      </header>

      <div className="mb-6 flex gap-2">
        <button
          type="button"
          onClick={retry}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          <RotateCcw size={14} /> {t('quiz.retry')}
        </button>
        <button
          type="button"
          onClick={backToLobby}
          className="flex-1 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm text-text-muted transition-colors hover:bg-surface-2 hover:text-text-strong"
        >
          {t('quiz.backToChoice')}
        </button>
      </div>

      <ul className="flex flex-col gap-2">
        {session.questions.map((q, i) => {
          const a = session.answers[i];
          const isCorrect = !!a?.correct;
          const skipped = a?.pickedId === null;
          return (
            <li key={q.key}>
              <ResultRow
                q={q}
                isCorrect={isCorrect}
                skipped={skipped}
                pickedId={a?.pickedId ?? null}
                partsById={partsById}
                system={system}
                t={t}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface RowProps {
  q: QuizQuestion;
  isCorrect: boolean;
  skipped: boolean;
  pickedId: string | null;
  partsById: Map<string, Part>;
  system: SystemMeta;
  t: TFn;
}

function ResultRow({ q, isCorrect, skipped, pickedId, partsById, system, t }: RowProps) {
  const pickedPart = pickedId ? partsById.get(pickedId) : null;
  const wrongIntoOtherSystem =
    !isCorrect && pickedPart && pickedPart.system !== system.id;
  return (
    <Link
      to={`/viewer?part=${encodeURIComponent(q.canonicalId)}`}
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-surface p-2.5 pr-3 transition-colors hover:bg-surface-2',
        isCorrect ? 'border-emerald-500/40' : 'border-rose-500/40',
      )}
    >
      <Thumbnail q={q} system={system} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text-strong">
          {q.prompt}
        </div>
        {q.promptSecondary && (
          <div className="truncate text-xs text-text-muted">
            {q.promptSecondary}
          </div>
        )}
        {!isCorrect && !skipped && pickedPart && (
          <div className="mt-0.5 truncate text-[11px] text-rose-400">
            {t('quiz.yourPick', { pick: pickedPart.name_en })}
            {wrongIntoOtherSystem ? ` (${pickedPart.system})` : ''}
          </div>
        )}
        {skipped && (
          <div className="mt-0.5 text-[11px] text-text-muted">{t('quiz.skippedLower')}</div>
        )}
      </div>
      <span
        className={cn(
          'flex size-7 shrink-0 items-center justify-center rounded-full',
          isCorrect
            ? 'bg-emerald-500/15 text-emerald-500'
            : 'bg-rose-500/15 text-rose-500',
        )}
      >
        {isCorrect ? <Check size={14} /> : <XIcon size={14} />}
      </span>
      <ChevronRight size={14} className="text-text-muted" />
    </Link>
  );
}

function Thumbnail({ q, system }: { q: QuizQuestion; system: SystemMeta }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <span
        className="flex size-12 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold text-white"
        style={{ backgroundColor: system.tint }}
        aria-hidden
      >
        {initials(q.prompt)}
      </span>
    );
  }
  return (
    <img
      src={thumbnailUrl(q.canonicalId)}
      alt=""
      className="size-12 shrink-0 rounded-lg bg-bg object-contain"
      onError={() => setErrored(true)}
    />
  );
}

function initials(s: string): string {
  const words = s.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0] + words[1]![0]).toUpperCase();
}
