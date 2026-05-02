import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, LogOut, Sparkles, User } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

type Packet = { euros: number; credits: number };

const PACKETS: Packet[] = [
  { euros: 2, credits: 20 },
  { euros: 5, credits: 60 },
  { euros: 10, credits: 150 },
];

export default function Profile() {
  const { user, loading, logout, addCredits } = useAuth();
  const navigate = useNavigate();
  const [busyEuros, setBusyEuros] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) return null;

  const buy = async (p: Packet) => {
    setBusyEuros(p.euros);
    try {
      await addCredits(p.credits);
      setToast(`Dodano ${p.credits} kredita.`);
      window.setTimeout(() => setToast(null), 2200);
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Greška prilikom kupnje.');
    } finally {
      setBusyEuros(null);
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
              {user.credits} <span className="text-sm font-normal text-text-muted">kredita</span>
            </div>
          </div>
        </div>
      </section>

      {/* Buy credits */}
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2 text-text-strong">
          <Sparkles size={16} className="text-accent" />
          <h2 className="text-sm font-semibold">Kupi kredite za AI</h2>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Krediti se troše za pitanja AI agentu. Demo — klik = uplata.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {PACKETS.map((p) => (
            <button
              key={p.euros}
              onClick={() => buy(p)}
              disabled={busyEuros !== null}
              className="group flex flex-col items-stretch overflow-hidden rounded-xl border border-border bg-surface-2 text-left transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="flex items-baseline gap-1 px-4 pt-4 text-text-strong">
                <span className="text-2xl font-semibold">{p.euros}</span>
                <span className="text-base">€</span>
              </div>
              <div className="px-4 pb-4 text-sm text-text-muted">
                <span className="text-accent-2">+{p.credits}</span> kredita
              </div>
              <div className="bg-accent/10 px-4 py-2 text-center text-xs font-medium text-accent transition-colors group-hover:bg-accent group-hover:text-white">
                {busyEuros === p.euros ? '…' : 'Kupi'}
              </div>
            </button>
          ))}
        </div>

        {toast && (
          <div className="mt-4 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-text">
            {toast}
          </div>
        )}
      </section>
    </div>
  );
}
