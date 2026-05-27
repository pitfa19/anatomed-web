import { Coins } from 'lucide-react';
import { useT, plural } from '../../lib/i18n';

type Props = {
  credits: number;
  onBuy: () => void;
};

export default function LowBalanceBanner({ credits, onBuy }: Props) {
  const t = useT();
  const unit = plural(t.lang, credits, {
    one: t('ai.tokenOne'),
    few: t('ai.tokenFew'),
    many: t('ai.tokenMany'),
  });
  // Keep the count bold while respecting per-language word order: the
  // translated string carries a literal {n} placeholder we split on.
  const [pre, post] = t('ai.remainingTokens', { unit }).split('{n}');
  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-warn/10 px-4 py-1.5 text-xs text-warn">
      <Coins size={12} />
      <span>
        {pre}
        <span className="font-semibold">{credits}</span>
        {post}
      </span>
      <button
        onClick={onBuy}
        className="ml-auto rounded border border-warn/40 bg-warn/10 px-2 py-0.5 text-[11px] font-medium text-warn transition-colors hover:bg-warn/20"
      >
        {t('ai.topUp')}
      </button>
    </div>
  );
}
