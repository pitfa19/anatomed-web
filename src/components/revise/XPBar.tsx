import { Flame, Star } from 'lucide-react';
import type { XPState } from '../../lib/xp';
import { getLevelProgress } from '../../lib/xp';
import { cn } from '../../lib/cn';

interface Props {
  state: XPState;
  className?: string;
}

export default function XPBar({ state, className }: Props) {
  const { level, xpInLevel, xpNeededForLevel, pct } = getLevelProgress(state.xp);

  return (
    <div className={cn('rounded-xl border border-border bg-surface p-3', className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent/15 text-sm font-bold text-accent">
            <Star size={16} className="fill-accent text-accent" />
          </span>
          <div>
            <div className="text-xs font-semibold text-text-strong">Razina {level}</div>
            <div className="text-[10px] text-text-muted">{state.xp} ukupno XP</div>
          </div>
        </div>
        {state.streak > 0 && (
          <div className="flex items-center gap-1 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-xs font-medium text-orange-400">
            <Flame size={12} />
            {state.streak} {state.streak === 1 ? 'dan' : state.streak < 5 ? 'dana' : 'dana'} niz
          </div>
        )}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-accent transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] text-text-muted">
        <span>{xpInLevel} / {xpNeededForLevel} XP</span>
        <span>Razina {level + 1}</span>
      </div>
    </div>
  );
}
