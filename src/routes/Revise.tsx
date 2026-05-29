import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, GraduationCap, Target } from 'lucide-react';
import { useT, plural } from '../lib/i18n';
import { loadXP, type XPState } from '../lib/xp';
import { loadDueSummary } from '../lib/reviseSummary';
import XPBar from '../components/revise/XPBar';
import DueBadge from '../components/revise/DueBadge';

export default function Revise() {
  const t = useT();
  const [xpState] = useState<XPState>(() => loadXP());
  const [totalDue, setTotalDue] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDueSummary()
      .then((s) => !cancelled && setTotalDue(s.totalDue))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const theorySubtitle =
    totalDue && totalDue > 0
      ? plural(t.lang, totalDue, {
          one: t('revise.cardsReadyOne', { n: totalDue }),
          few: t('revise.cardsReadyMany', { n: totalDue }),
          many: t('revise.cardsReadyMany', { n: totalDue }),
        })
      : t('revise.theoryDesc');

  return (
    <div className="mx-auto h-full w-full max-w-3xl overflow-y-auto px-4 py-6 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-text-strong">{t('revise.title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('revise.chooseMode')}</p>
      </header>

      <XPBar state={xpState} className="mb-4" />

      <div className="flex flex-col gap-3">
        <Link
          to="/revise/teorija"
          className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent/40 hover:bg-surface-2"
        >
          <div className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent text-white">
              <GraduationCap size={22} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-base font-semibold text-text-strong">
                  {t('revise.theoryTitle')}
                </span>
                {totalDue != null && totalDue > 0 && <DueBadge count={totalDue} />}
              </div>
              <div className="mt-0.5 text-xs text-text-muted">{theorySubtitle}</div>
            </div>
          </div>
          <ChevronRight
            size={18}
            className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
          />
        </Link>

        <Link
          to="/revise/praksa"
          className="group flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-accent-2/40 hover:bg-surface-2"
        >
          <div className="flex items-center gap-4">
            <span className="flex size-12 items-center justify-center rounded-xl bg-accent-2 text-white">
              <Target size={22} />
            </span>
            <div>
              <div className="text-base font-semibold text-text-strong">
                {t('revise.practiceTitle')}
              </div>
              <div className="mt-0.5 text-xs text-text-muted">{t('revise.practiceDesc')}</div>
            </div>
          </div>
          <ChevronRight
            size={18}
            className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </div>
  );
}
