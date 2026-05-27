import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogIn, UserPlus } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { cn } from '../lib/cn';
import { useT } from '../lib/i18n';

type Mode = 'login' | 'signup';

export default function Login() {
  const t = useT();
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) navigate('/profile', { replace: true });
  }, [user, navigate]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(username, password);
      else await signup(username, password);
      navigate('/profile', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-xl">
        <div className="mb-5 flex items-center justify-center gap-2 text-text-strong">
          {mode === 'login' ? <LogIn size={18} /> : <UserPlus size={18} />}
          <h1 className="text-lg font-semibold">
            {mode === 'login' ? t('auth.signIn') : t('auth.signUp')}
          </h1>
        </div>

        <div className="mb-5 flex rounded-lg border border-border bg-surface-2 p-1 text-sm">
          {(['login', 'signup'] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 transition-colors',
                mode === m
                  ? 'bg-surface text-text-strong shadow-sm'
                  : 'text-text-muted hover:text-text',
              )}
            >
              {m === 'login' ? t('auth.signIn') : t('auth.signUp')}
            </button>
          ))}
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">
              {t('auth.username')}
            </label>
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-text-muted">
              {t('auth.password')}
            </label>
            <input
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text outline-none focus:border-accent"
            />
          </div>

          {error && (
            <div className="rounded-md border border-border bg-surface-2 px-3 py-2 text-xs text-warn">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !username || !password}
            className="w-full rounded-md bg-accent px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '…' : mode === 'login' ? t('auth.signInAction') : t('auth.signUpAction')}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-text-muted">
          <Link to="/" className="hover:text-text">
            {t('auth.backHome')}
          </Link>
        </div>
      </div>
    </div>
  );
}
