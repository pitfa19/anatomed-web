import { cn } from '../../lib/cn';
import { TIER_STYLES, type PackageId, type TokenPackage } from '../../lib/packages';

type Props = {
  pkg: TokenPackage;
  busy: boolean;
  busyThis: boolean;
  onBuy: (id: PackageId) => void;
  recommended?: boolean;
};

export default function PackageCard({ pkg, busy, busyThis, onBuy, recommended }: Props) {
  const tier = TIER_STYLES[pkg.id];
  return (
    <button
      onClick={() => onBuy(pkg.id)}
      disabled={busy}
      className={cn(
        'group relative flex flex-col items-stretch overflow-hidden rounded-xl border border-border bg-surface-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        tier.border,
        recommended && tier.ring,
      )}
    >
      {recommended && (
        <span
          className={cn(
            'absolute right-2 top-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
            tier.cta,
          )}
        >
          Najpopularnije
        </span>
      )}
      <div className="flex flex-1 flex-col px-4 pt-4">
        <div className="flex items-baseline gap-1 text-text-strong">
          <span className="text-2xl font-semibold">{pkg.priceEur}</span>
          <span className="text-base">€</span>
        </div>
        <div
          className={cn(
            'text-[11px] font-medium uppercase tracking-wide',
            tier.accent,
          )}
        >
          {pkg.label}
        </div>
        <div className="pb-2 pt-1 text-sm text-text-muted">
          <span className={tier.accent}>+{pkg.tokens}</span> tokena
        </div>
        <div className="pb-3 text-[11px] text-text-muted">{pkg.blurb}</div>
      </div>
      <div
        className={cn(
          'mt-auto px-4 py-2 text-center text-xs font-medium transition-colors',
          tier.cta,
          tier.ctaHover,
        )}
      >
        {busyThis ? '…' : 'Kupi'}
      </div>
    </button>
  );
}
