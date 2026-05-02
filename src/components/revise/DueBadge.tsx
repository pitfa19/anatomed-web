import { Clock } from 'lucide-react';
import { cn } from '../../lib/cn';

interface Props {
  count: number;
  className?: string;
}

export default function DueBadge({ count, className }: Props) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-semibold text-warn',
        className,
      )}
      aria-label={`${count} pitanja na redu`}
    >
      <Clock size={11} />
      {count}
    </span>
  );
}
