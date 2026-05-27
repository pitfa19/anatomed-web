import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, X as XIcon } from 'lucide-react';
import { loadCatalog, getSystem } from '../lib/viewer/catalog';
import type { Part, PartsCatalog } from '../lib/viewer/types';
import { gradeAnswer, type QuizAnswer, type QuizQuestion } from '../lib/quiz';
import {
  clearQuizSession,
  loadQuizSession,
  startQuizSession,
  type QuizSession,
} from '../lib/quizSession';
import QuizScene from '../components/quiz/QuizScene';
import { cn } from '../lib/cn';
import { useT } from '../lib/i18n';

type Phase = 'guess' | 'reveal';

const REVEAL_MS = 1100;

export default function QuizGame() {
  const navigate = useNavigate();
  const t = useT();
  const [catalog, setCatalog] = useState<PartsCatalog | null>(null);
  const [session, setSession] = useState<QuizSession | null>(() => loadQuizSession());
  const [phase, setPhase] = useState<Phase>('guess');
  const [lastAnswer, setLastAnswer] = useState<QuizAnswer | null>(null);

  useEffect(() => {
    loadCatalog().then(setCatalog).catch(() => {
      /* fallthrough: render error state below */
    });
  }, []);

  // No active session - bounce to lobby.
  useEffect(() => {
    if (!session) navigate('/revise/praksa', { replace: true });
  }, [session, navigate]);

  // When the active deck is exhausted, persist + go to results.
  useEffect(() => {
    if (!session) return;
    if (session.currentIdx < session.questions.length) return;
    navigate('/revise/praksa/results', { replace: true });
  }, [session, navigate]);

  const advanceTimerRef = useRef<number | null>(null);
  useEffect(() => {
    return () => {
      if (advanceTimerRef.current !== null) {
        window.clearTimeout(advanceTimerRef.current);
      }
    };
  }, []);

  const currentQ: QuizQuestion | null = useMemo(() => {
    if (!session) return null;
    return session.questions[session.currentIdx] ?? null;
  }, [session]);

  const system = useMemo(() => {
    if (!catalog || !session) return null;
    return getSystem(catalog, session.config.systemId);
  }, [catalog, session]);

  function handlePartClick(part: Part) {
    if (!session || !currentQ || phase !== 'guess') return;
    const answer = gradeAnswer(currentQ, part.id);
    setLastAnswer(answer);
    setPhase('reveal');
    const nextSession: QuizSession = {
      ...session,
      answers: [...session.answers, answer],
    };
    setSession(nextSession);
    startQuizSession(nextSession);
    advanceTimerRef.current = window.setTimeout(() => {
      const advanced: QuizSession = {
        ...nextSession,
        currentIdx: nextSession.currentIdx + 1,
      };
      setSession(advanced);
      startQuizSession(advanced);
      setPhase('guess');
      setLastAnswer(null);
    }, REVEAL_MS);
  }

  function handleSkip() {
    if (!session || !currentQ || phase !== 'guess') return;
    const answer: QuizAnswer = {
      questionKey: currentQ.key,
      pickedId: null,
      correct: false,
    };
    setLastAnswer(answer);
    setPhase('reveal');
    const nextSession: QuizSession = {
      ...session,
      answers: [...session.answers, answer],
    };
    setSession(nextSession);
    startQuizSession(nextSession);
    advanceTimerRef.current = window.setTimeout(() => {
      const advanced: QuizSession = {
        ...nextSession,
        currentIdx: nextSession.currentIdx + 1,
      };
      setSession(advanced);
      startQuizSession(advanced);
      setPhase('guess');
      setLastAnswer(null);
    }, REVEAL_MS);
  }

  function handleQuit() {
    clearQuizSession();
    navigate('/revise/praksa', { replace: true });
  }

  if (!session || !currentQ) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t('quiz.loading')}
      </div>
    );
  }
  if (!catalog || !system) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t('quiz.loadingCatalog')}
      </div>
    );
  }

  const correctSoFar = session.answers.filter((a) => a.correct).length;
  const total = session.questions.length;
  const idx = session.currentIdx + 1;
  // During reveal, show the correct part highlighted regardless of right/wrong.
  const highlightPartId = phase === 'reveal' ? currentQ.canonicalId : null;
  const flashTone =
    phase === 'reveal' && lastAnswer
      ? lastAnswer.correct
        ? 'ring-2 ring-emerald-400/70'
        : 'ring-2 ring-rose-400/70'
      : '';

  return (
    <div className="flex h-full flex-col">
      {/* Top bar: back, progress, score */}
      <div className="flex items-center justify-between gap-3 border-b border-border bg-surface/60 px-4 py-2.5 backdrop-blur">
        <button
          type="button"
          onClick={handleQuit}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-text-muted hover:bg-surface-2 hover:text-text-strong"
        >
          <ArrowLeft size={14} /> {t('quiz.quit')}
        </button>
        <div className="flex items-center gap-3 text-xs text-text-muted">
          <span>
            {idx} / {total}
          </span>
          <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent">
            {correctSoFar}
          </span>
        </div>
      </div>

      {/* Prompt header */}
      <div className="border-b border-border bg-bg px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-muted">
              {t('quiz.find')}
            </p>
            <p className="mt-0.5 text-lg font-semibold text-text-strong sm:text-xl">
              {currentQ.prompt}
            </p>
            {currentQ.promptSecondary && (
              <p className="text-xs text-text-muted">{currentQ.promptSecondary}</p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSkip}
            disabled={phase !== 'guess'}
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface hover:text-text-strong disabled:opacity-40"
          >
            {t('quiz.skip')}
          </button>
        </div>
      </div>

      {/* 3D scene - fills the rest */}
      <div className={cn('relative flex-1 overflow-hidden', flashTone)}>
        <QuizScene
          system={system}
          catalog={catalog}
          questionEpoch={session.currentIdx}
          highlightPartId={highlightPartId}
          onPartClick={handlePartClick}
        />
        {phase === 'reveal' && lastAnswer && (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2">
            <div
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium shadow-lg',
                lastAnswer.correct
                  ? 'bg-emerald-500/90 text-white'
                  : 'bg-rose-500/90 text-white',
              )}
            >
              {lastAnswer.correct ? t('quiz.correct') : (
                <>
                  <XIcon size={14} /> {lastAnswer.pickedId === null ? t('quiz.skipped') : t('quiz.wrong')}
                </>
              )}
            </div>
          </div>
        )}
        <Link
          to="/viewer"
          className="pointer-events-auto absolute bottom-3 right-3 rounded-md border border-border bg-surface/80 px-2 py-1 text-[10px] text-text-muted backdrop-blur hover:bg-surface hover:text-text-strong"
          title={t('quiz.open3dTitle')}
        >
          {t('quiz.view3d')}
        </Link>
      </div>
    </div>
  );
}
