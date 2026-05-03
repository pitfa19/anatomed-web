import { Coins } from 'lucide-react';

type Props = {
  credits: number;
  onBuy: () => void;
};

export default function LowBalanceBanner({ credits, onBuy }: Props) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-warn/10 px-4 py-1.5 text-xs text-warn">
      <Coins size={12} />
      <span>
        Preostalo <span className="font-semibold">{credits}</span>{' '}
        {credits === 1 ? 'token' : 'tokena'}.
      </span>
      <button
        onClick={onBuy}
        className="ml-auto rounded border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn transition-colors hover:bg-warn/20"
      >
        Dopuni
      </button>
    </div>
  );
}
