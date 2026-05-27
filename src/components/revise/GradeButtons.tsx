import { X, AlertCircle, Check } from 'lucide-react';
import type { Grade } from '../../lib/types';
import { cn } from '../../lib/cn';
import { useT } from '../../lib/i18n';
import type { TKey } from '../../lib/i18n';

interface Props {
  onGrade: (grade: Grade) => void;
  className?: string;
}

const OPTIONS: Array<{
  grade: Grade;
  labelKey: TKey;
  hintKey: TKey;
  icon: typeof X;
  classes: string;
}> = [
  {
    grade: 'wrong',
    labelKey: 'revise.gradeWrong',
    hintKey: 'revise.gradeWrongHint',
    icon: X,
    classes:
      'border-warn/40 bg-warn/10 text-warn hover:bg-warn/20 focus-visible:ring-warn/50',
  },
  {
    grade: 'hard',
    labelKey: 'revise.gradeHard',
    hintKey: 'revise.gradeHardHint',
    icon: AlertCircle,
    classes:
      'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20 focus-visible:ring-accent/50',
  },
  {
    grade: 'good',
    labelKey: 'revise.gradeGood',
    hintKey: 'revise.gradeGoodHint',
    icon: Check,
    classes:
      'border-accent-2/40 bg-accent-2/10 text-accent-2 hover:bg-accent-2/20 focus-visible:ring-accent-2/50',
  },
];

export default function GradeButtons({ onGrade, className }: Props) {
  const t = useT();
  return (
    <div
      className={cn('grid grid-cols-3 gap-2', className)}
      role="group"
      aria-label={t('revise.gradeAria')}
    >
      {OPTIONS.map(({ grade, labelKey, hintKey, icon: Icon, classes }) => {
        const label = t(labelKey);
        const hint = t(hintKey);
        return (
          <button
            key={grade}
            type="button"
            onClick={() => onGrade(grade)}
            aria-label={t('revise.gradeButtonAria', {
              label,
              hint: hint.toLowerCase(),
            })}
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
        );
      })}
    </div>
  );
}
