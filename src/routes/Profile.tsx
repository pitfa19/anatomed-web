import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, User, Zap } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import {
  DAILY_TOKEN_LIMIT,
  LOW_REMAINING_FRACTION,
  formatTokens,
  nextDailyReset,
} from '../lib/usage';
import { cn } from '../lib/cn';
import { useT } from '../lib/i18n';

export default function Profile() {
  const t = useT();
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate('/login', { replace: true });
  }, [loading, user, navigate]);

  if (loading || !user) return null;

  const used = Math.min(user.tokensUsedToday, DAILY_TOKEN_LIMIT);
  const remaining = Math.max(0, DAILY_TOKEN_LIMIT - user.tokensUsedToday);
  const pct = Math.min(100, Math.round((user.tokensUsedToday / DAILY_TOKEN_LIMIT) * 100));
  const low = remaining <= DAILY_TOKEN_LIMIT * LOW_REMAINING_FRACTION;
  const resetAt = nextDailyReset().toLocaleTimeString(t.lang === 'hr' ? 'hr-HR' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="mx-auto h-full w-full max-w-2xl overflow-y-auto px-4 py-8 sm:px-6">
      {/* Account card */}
      <section className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-full bg-accent/15 text-accent">
            <User size={20} />
          </div>
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-text-muted">{t('profile.title')}</div>
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
            <LogOut size={13} /> {t('profile.logout')}
          </button>
        </div>
      </section>

      {/* Daily AI usage */}
      <section className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2 text-text-strong">
          <Zap size={16} className="text-accent" />
          <h2 className="text-sm font-semibold">{t('profile.usageTitle')}</h2>
        </div>

        <div className="mt-4 flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-text-strong">{formatTokens(used)}</span>
          <span className="text-sm text-text-muted">/ {formatTokens(DAILY_TOKEN_LIMIT)}</span>
          <span className="text-xs text-text-muted">{t('profile.usageTokensToday')}</span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div
            className={cn('h-full rounded-full transition-all', low ? 'bg-warn' : 'bg-accent')}
            style={{ width: `${pct}%` }}
          />
        </div>

        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="text-text-muted">{t('profile.usageResets', { time: resetAt })}</span>
          <span className={cn('font-medium', low ? 'text-warn' : 'text-text-muted')}>
            {t('profile.usageRemaining', { n: formatTokens(remaining) })}
          </span>
        </div>

        <p className="mt-4 text-[11px] leading-relaxed text-text-muted">
          {t('profile.usageExplain')}
        </p>
      </section>
    </div>
  );
}
