import { X, AlertCircle, Check } from 'lucide-react';
import type { Grade } from '../../lib/types';
import { cn } from '../../lib/cn';

interface Props {
  onGrade: (grade: Grade) => void;
  className?: string;
}

const OPTIONS: Array<{
  grade: Grade;
  label: string;
  hint: string;
  icon: typeof X;
  classes: string;
}> = [
  {
    grade: 'wrong',
    label: 'Krivo',
    hint: 'Za 1 dan',
    icon: X,
    classes:
      'border-warn/40 bg-warn/10 text-warn hover:bg-warn/20 focus-visible:ring-warn/50',
  },
  {
    grade: 'hard',
    label: 'Teško',
    hint: 'Za 3 dana',
    icon: AlertCircle,
    classes:
      'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 focus-visible:ring-accent/50',
  },
  {
    grade: 'good',
    label: 'Znam',
    hint: 'Za 7+ dana',
    icon: Check,
    classes:
      'border-accent-2/40 bg-accent-2/10 text-accent-2 hover:bg-accent-2/20 focus-visible:ring-accent-2/50',
  },
];

export default function GradeButtons({ onGrade, className }: Props) {
  return (
    <div
      className={cn('grid grid-cols-3 gap-2', className)}
      role="group"
      aria-label="Ocijeni odgovor"
    >
      {OPTIONS.map(({ grade, label, hint, icon: Icon, classes }) => (
        <button
          key={grade}
          type="button"
          onClick={() => onGrade(grade)}
          aria-label={`${label} — sljedeće ${hint.toLowerCase()}`}
          className={cn(
            'flex flex-col items-center gap-0.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2',
            classes,
          )}
        >
          <span className="flex items-center gap-1.5">
            <Icon size={13} />
            {label}
          </span>
          <span className="text-[10px] opacity-70">{hint}</span>
        </button>
      ))}
    </div>
  );
}
