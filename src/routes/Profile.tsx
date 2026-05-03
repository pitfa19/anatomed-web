import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, History, LogOut, Sparkles, User } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { PACKAGES, FEATURE_LABEL, type PackageId } from '../lib/packages';
import type { TokenTransaction } from '../lib/transactions';
import PackageCard from '../components/ai/PackageCard';

export default function Profile() {
  const { user, loading, logout, purchasePackage, transactions } = useAuth();
  const navigate = useNavigate();
  const [busyId, setBusyId] = useState<PackageId | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) return null;

  const buy = async (id: PackageId) => {
    setBusyId(id);
    try {
      await purchasePackage(id);
      const pkg = PACKAGES.find((p) => p.id === id)!;
      setToast(`Dodano ${pkg.tokens} AI tokena.`);
      window.setTimeout(() => setToast(null), 2200);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Greška prilikom kupnje.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto px-4 py-8 sm:px-6">
      {/* Account card */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-accent/15 text-accent">
            <User size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-text-muted">Profil</div>
            <div className="truncate text-base font-semibold text-text-strong">
              {user.username}
            </div>
          </div>
          <button
            onClick={async () => {
              await logout();
              navigate('/', { replace: true });
            }}
            className="ml-auto flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-xs text-text-muted transition-colors hover:bg-surface hover:text-text"
          >
            <LogOut size={13} /> Odjava
          </button>
        </div>

        <div className="mt-5 flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-4 py-3">
          <Coins size={20} className="text-accent-2" />
          <div>
            <div className="text-xs text-text-muted">Trenutno stanje</div>
            <div className="text-2xl font-semibold text-text-strong">
              {user.credits}{' '}
              <span className="text-sm font-normal text-text-muted">AI tokena</span>
            </div>
          </div>
        </div>
      </section>

      {/* Buy tokens */}
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2 text-text-strong">
          <Sparkles size={16} className="text-accent" />
          <h2 className="text-sm font-semibold">Kupi AI tokene</h2>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {PACKAGES.map((p) => (
            <PackageCard
              key={p.id}
              pkg={p}
              busy={busyId !== null}
              busyThis={busyId === p.id}
              onBuy={buy}
              recommended={p.id === 'standard'}
            />
          ))}
        </div>

        {toast && (
          <div className="mt-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-text">
            {toast}
          </div>
        )}
      </section>

      {/* Transaction history */}
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2 text-text-strong">
          <History size={16} className="text-accent-2" />
          <h2 className="text-sm font-semibold">Moje kupnje i potrošnja</h2>
        </div>
        {transactions.length === 0 ? (
          <p className="mt-2 text-xs text-text-muted">Nema zapisa još.</p>
        ) : (
          <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface-2">
            {transactions.slice(0, 20).map((t) => (
              <TransactionRow key={t.id} tx={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TransactionRow({ tx }: { tx: TokenTransaction }) {
  const ts = new Date(tx.created_at).toLocaleString('hr-HR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const positive = tx.delta > 0;
  const label = labelForKind(tx);
  return (
    <li className="flex items-center gap-3 px-3 py-2 text-xs">
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-text">{label}</div>
        <div className="text-[11px] text-text-muted">{ts}</div>
      </div>
      <div
        className={`shrink-0 font-semibold ${positive ? 'text-accent-2' : 'text-text-muted'}`}
      >
        {positive ? '+' : ''}
        {tx.delta}
      </div>
      <div className="w-14 shrink-0 text-right text-[11px] text-text-muted">
        = {tx.balance_after}
      </div>
    </li>
  );
}

function labelForKind(tx: TokenTransaction): string {
  switch (tx.kind) {
    case 'signup_grant':
      return 'Besplatni početni paket';
    case 'purchase': {
      const pkg = tx.package_id ? PACKAGES.find((p) => p.id === tx.package_id) : null;
      const price = tx.price_eur != null ? ` · ${tx.price_eur} €` : '';
      return `Kupnja${pkg ? ` (${pkg.label})` : ''}${price}`;
    }
    case 'consumption':
      return tx.feature ? FEATURE_LABEL[tx.feature] : 'Potrošnja';
    case 'refund':
      return 'Povrat';
    case 'manual_adjust':
      return 'Ručna prilagodba';
  }
}
