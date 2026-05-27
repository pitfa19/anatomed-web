import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Flame,
  Loader2,
  Pencil,
  RotateCcw,
  Sparkles,
  Star,
} from 'lucide-react';
import {
  dueCardsForUserDeck,
  getDeck,
  gradeUserCard,
  resetUserDeck,
  type UserCard,
  type UserDeck,
} from '../lib/userDecks';
import { awardXP, getLevelProgress, loadXP, type XPState } from '../lib/xp';
import { shuffle } from '../lib/srs';
import type { Grade } from '../lib/types';
import GradeButtons from '../components/revise/GradeButtons';
import { cn } from '../lib/cn';
import { useT, plural } from '../lib/i18n';

interface StudyItem {
  card: UserCard;
}

export default function DeckStudy() {
  const t = useT();
  const { deckId } = useParams<{ deckId: string }>();
  const [searchParams] = useSearchParams();
  const dueOnly = searchParams.get('due') !== '0';
  const navigate = useNavigate();

  const [deck, setDeck] = useState<UserDeck | null>(null);
  const [items, setItems] = useState<StudyItem[] | null>(null);
  const [pos, setPos] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [graded, setGraded] = useState(0);
  const [sessionXP, setSessionXP] = useState(0);
  const [xpState, setXPState] = useState<XPState>(() => loadXP());
  const [xpPopups, setXPPopups] = useState<Array<{ id: number; amount: number; leveledUp: boolean }>>([]);
  const popupRef = useRef(0);

  useEffect(() => {
    if (!deckId) return;
    const d = getDeck(deckId);
    if (!d) { navigate('/revise/my-decks', { replace: true }); return; }
    setDeck(d);

    const now = Date.now();
    const due = dueCardsForUserDeck(d, now);
    const all = d.cards.map((card) => ({ card }));
    const source = dueOnly ? due.map((dc) => ({ card: dc.card })) : all;
    setItems(shuffle(source, now));
    setPos(0);
    setRevealed(false);
    setGraded(0);
  }, [deckId, dueOnly, navigate]);

  const current = useMemo(() => (items ? items[pos] : null), [items, pos]);
  const total = items?.length ?? 0;
  const done = pos >= total;

  function handleGrade(grade: Grade) {
    if (!current || !deck) return;
    gradeUserCard(deck.id, current.card.id, grade);
    const { gained, newState, leveledUp } = awardXP(grade);
    setXPState(newState);
    setSessionXP((s) => s + gained);
    popupRef.current += 1;
    setXPPopups((prev) => [...prev, { id: popupRef.current, amount: gained, leveledUp }]);
    setGraded((g) => g + 1);
    setRevealed(false);
    setPos((p) => p + 1);
  }

  function handleReset() {
    if (!deck) return;
    resetUserDeck(deck);
    const source = deck.cards.map((card) => ({ card }));
    setItems(shuffle(source, Date.now()));
    setPos(0);
    setRevealed(false);
    setGraded(0);
    setSessionXP(0);
  }

  const { level, pct } = getLevelProgress(xpState.xp);

  if (!deck || !items) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-text-muted">
        <Loader2 size={16} className="animate-spin" /> {t('decks.loading')}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col">
      <header className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
        <div className="mb-2 flex items-center justify-between">
          <Link
            to="/revise/my-decks"
            className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-text-strong"
          >
            <ArrowLeft size={12} /> {t('decks.studyMyDecks')}
          </Link>
          <div className="flex items-center gap-2">
            {xpState.streak > 1 && (
              <span className="flex items-center gap-1 rounded-full border border-orange-500/20 bg-orange-500/10 px-2 py-0.5 text-xs text-orange-400">
                <Flame size={11} />
                {xpState.streak}
              </span>
            )}
            <span
              className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent"
              title={`${xpState.xp} XP`}
            >
              <Star size={11} className="fill-accent" />
              {t('revise.level', { level })}
            </span>
            <Link
              to={`/revise/deck/${deck.id}/edit`}
              className="flex size-6 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text-strong"
              title={t('decks.editDeck')}
            >
              <Pencil size={13} />
            </Link>
          </div>
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold text-text-strong">{deck.name}</h1>
            <p className="mt-0.5 text-xs text-text-muted">
              {total === 0
                ? dueOnly
                  ? t('decks.noCardsDue')
                  : t('decks.deckEmpty')
                : t('decks.progressCards', {
                    done: Math.min(pos, total),
                    total,
                    xp: graded > 0 ? ` · +${sessionXP} XP` : '',
                  })}
            </p>
          </div>
          {total > 0 && !done && (
            <button
              onClick={handleReset}
              title={t('decks.resetProgress')}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-2 hover:text-text-strong"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>

        {total > 0 && (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-accent-2 transition-all"
              style={{ width: `${(Math.min(pos, total) / total) * 100}%` }}
            />
          </div>
        )}

        {/* XP level bar */}
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-accent/40 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </header>

      <div className="relative flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        {/* XP popups */}
        <div className="pointer-events-none absolute right-6 top-4 z-10 flex flex-col items-end gap-1">
          <AnimatePresence>
            {xpPopups.map((p) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 1, y: 0, scale: 1 }}
                animate={{ opacity: 0, y: -28, scale: 0.85 }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
                onAnimationComplete={() =>
                  setXPPopups((prev) => prev.filter((x) => x.id !== p.id))
                }
                className={cn(
                  'flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold shadow-lg',
                  p.leveledUp
                    ? 'bg-accent text-white'
                    : 'bg-accent/15 text-accent',
                )}
              >
                <Star size={10} className={p.leveledUp ? 'fill-white' : 'fill-accent'} />
                +{p.amount} XP
                {p.leveledUp && t('revise.levelUp')}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        {total === 0 && (
          <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-8 text-center">
            <Sparkles size={28} className="text-accent-2" />
            <h2 className="text-lg font-semibold text-text-strong">
              {dueOnly ? t('decks.allDoneToday') : t('decks.deckEmptyTitle')}
            </h2>
            <p className="text-sm text-text-muted">
              {dueOnly
                ? t('decks.noCardsDueDesc')
                : t('decks.addCardsDesc')}
            </p>
            {dueOnly ? (
              <Link
                to={`/revise/deck/${deck.id}?due=0`}
                className="mt-2 rounded-md border border-border px-4 py-2 text-sm text-text-muted hover:bg-surface-2"
              >
                {t('decks.practiceAll')}
              </Link>
            ) : (
              <Link
                to={`/revise/deck/${deck.id}/edit`}
                className="mt-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
              >
                {t('decks.addCards')}
              </Link>
            )}
          </div>
        )}

        {done && total > 0 && (
          <div className="mx-auto mt-12 flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 text-center">
            <Sparkles size={28} className="text-accent-2" />
            <h2 className="text-lg font-semibold text-text-strong">{t('revise.done')}</h2>
            <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-surface-2/60 p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">{t('revise.graded')}</span>
                <span className="font-semibold text-text-strong">{t('decks.gradedCards', { n: graded })}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-muted">{t('revise.earnedXP')}</span>
                <span className="flex items-center gap-1 font-semibold text-accent">
                  <Star size={13} className="fill-accent" />
                  +{sessionXP} XP
                </span>
              </div>
              {xpState.streak > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">{t('revise.streak')}</span>
                  <span className="flex items-center gap-1 font-semibold text-orange-400">
                    <Flame size={13} />
                    {plural(t.lang, xpState.streak, {
                      one: t('revise.streakDaysOne', { n: xpState.streak }),
                      few: t('revise.streakDaysMany', { n: xpState.streak }),
                      many: t('revise.streakDaysMany', { n: xpState.streak }),
                    })}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-text-muted">{t('revise.levelLabel')}</span>
                <span className="font-semibold text-text-strong">{level}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                to="/revise/my-decks"
                className="rounded-md border border-border px-4 py-2 text-sm text-text-muted hover:bg-surface-2"
              >
                {t('decks.studyMyDecks')}
              </Link>
              <button
                onClick={handleReset}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90"
              >
                {t('decks.practiceAgain')}
              </button>
            </div>
          </div>
        )}

        {!done && current && (
          <article className="rounded-2xl border border-border bg-surface p-5">
            <div className="mb-3 flex items-center justify-between gap-3 text-xs text-text-muted">
              <span className="rounded-md border border-border bg-surface-2 px-2 py-0.5">
                {deck.name}
              </span>
              <span>
                {pos + 1} / {total}
              </span>
            </div>
            <h2 className="text-base font-semibold leading-snug text-text-strong">
              {current.card.q}
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
                  {current.card.a}
                </div>
                <GradeButtons onGrade={handleGrade} />
              </div>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
