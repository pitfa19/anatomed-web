import { useEffect, useState } from 'react';
import { Coins, Sparkles, X } from 'lucide-react';
import { PACKAGES, type PackageId } from '../../lib/packages';
import { useAuth } from '../../lib/AuthContext';
import { useT } from '../../lib/i18n';
import PackageCard from './PackageCard';

type Props = {
  open: boolean;
  onClose: () => void;
  // Customizes the headline. Defaults to a generic AI-out-of-tokens message.
  reason?: 'out' | 'low';
  featureLabel?: string;
};

export default function OutOfTokensModal({
  open,
  onClose,
  reason = 'out',
  featureLabel,
}: Props) {
  const t = useT();
  const { user, purchasePackage } = useAuth();
  const [busyPkg, setBusyPkg] = useState<PackageId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setBusyPkg(null);
      setError(null);
      setSuccess(null);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleBuy(id: PackageId) {
    setBusyPkg(id);
    setError(null);
    setSuccess(null);
    try {
      await purchasePackage(id);
      const pkg = PACKAGES.find((p) => p.id === id)!;
      setSuccess(t('ai.tokensAdded', { n: pkg.tokens }));
      // Auto-close after a short success flash so the user can retry their action.
      window.setTimeout(() => {
        onClose();
      }, 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('ai.purchaseError'));
    } finally {
      setBusyPkg(null);
    }
  }

  const headline =
    reason === 'low'
      ? t('ai.lowHeadline')
      : featureLabel
        ? t('ai.notEnoughFor', { feature: featureLabel })
        : t('ai.notEnoughDefault');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <Sparkles size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-strong">{headline}</h2>
            <p className="mt-1 text-xs text-text-muted">
              {t('ai.tokensExplain')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-1 rounded p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text"
            aria-label={t('common.close')}
          >
            <X size={16} />
          </button>
        </div>

        {user && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs">
            <Coins size={13} className="text-accent-2" />
            <span className="text-text-muted">{t('ai.currentBalance')}</span>
            <span className="font-semibold text-text-strong">
              {user.credits} {t('common.aiTokens')}
            </span>
          </div>
        )}

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {PACKAGES.map((p) => (
            <PackageCard
              key={p.id}
              pkg={p}
              busy={busyPkg !== null}
              busyThis={busyPkg === p.id}
              onBuy={handleBuy}
              recommended={p.id === 'standard'}
            />
          ))}
        </div>

        <p className="mt-3 text-[11px] text-text-muted">
          {t('ai.demoNote')}
        </p>

        {error && (
          <div className="mt-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-warn">
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-text">
            {success}
          </div>
        )}
      </div>
    </div>
  );
}
