import { cn } from '../../lib/cn';
import { useT } from '../../lib/i18n';

interface Props {
  known: number;
  learning: number;
  total: number;
  /** Optional heading shown above the bar (e.g. on the overall card). */
  label?: string;
  /** Show the "known X · learning Y · new Z" breakdown line. */
  showCounts?: boolean;
  className?: string;
}

/** A segmented progress bar: solid = known, faded = learning, track = new.
 *  Replaces the old XP/level bar with an honest "how much of this have I
 *  learned" signal derived from the SRS Leitner boxes. */
export default function MasteryBar({ known, learning, total, label, showCounts, className }: Props) {
  const t = useT();
  const fresh = Math.max(0, total - known - learning);
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0);

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <span className="text-xs font-semibold text-text-strong">{label}</span>
      )}
      <div className="flex items-center gap-2">
        <div className="flex h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct(known)}%` }} />
          <div className="h-full bg-accent/35 transition-all" style={{ width: `${pct(learning)}%` }} />
        </div>
        <span className="shrink-0 text-[10px] text-text-muted">
          {t('revise.mastKnownOfTotal', { known, total })}
        </span>
      </div>
      {showCounts && (
        <span className="text-[10px] text-text-muted">
          {t('revise.mastCounts', { known, learning, new: fresh })}
        </span>
      )}
    </div>
  );
}
