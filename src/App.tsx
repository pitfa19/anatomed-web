import { Suspense, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BookOpen,
  MessagesSquare,
  GraduationCap,
  Home as HomeIcon,
  Box,
  Sun,
  Moon,
  Menu,
  X,
  User as UserIcon,
  LogIn,
  Zap,
  Loader2,
} from 'lucide-react';
import { cn } from './lib/cn';
import { useTheme } from './lib/theme';
import { useAuth } from './lib/AuthContext';
import { DAILY_TOKEN_LIMIT, LOW_REMAINING_FRACTION, formatTokens } from './lib/usage';
import { useT, useLang } from './lib/i18n';
import type { TKey } from './lib/i18n';

type NavItem = {
  to: string;
  labelKey: TKey;
  icon: typeof HomeIcon;
  end?: boolean;
};

const NAV: NavItem[] = [
  { to: '/', labelKey: 'nav.home', icon: HomeIcon, end: true },
  { to: '/docs', labelKey: 'nav.docs', icon: BookOpen },
  { to: '/agent', labelKey: 'nav.agent', icon: MessagesSquare },
  { to: '/revise', labelKey: 'nav.revise', icon: GraduationCap },
  { to: '/viewer', labelKey: 'nav.viewer', icon: Box },
];

export default function App() {
  const loc = useLocation();
  const onHome = loc.pathname === '/';
  const [theme, , toggleTheme] = useTheme();
  const { lang, toggleLang } = useLang();
  const t = useT();
  const { user } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef<HTMLDivElement>(null);

  // Close nav on route change.
  useEffect(() => {
    setNavOpen(false);
  }, [loc.pathname]);

  // Click outside / Esc to close. Defer attaching the click listener by one tick
  // so the click that opened the menu doesn't immediately close it.
  useEffect(() => {
    if (!navOpen) return;
    let armed = false;
    const arm = window.setTimeout(() => {
      armed = true;
    }, 0);
    const onDoc = (e: MouseEvent) => {
      if (!armed) return;
      if (!navRef.current?.contains(e.target as Node)) setNavOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(arm);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [navOpen]);

  const currentNav = NAV.find((n) =>
    n.end ? loc.pathname === n.to : loc.pathname.startsWith(n.to),
  );

  return (
    <div className="flex h-full w-full flex-col bg-bg text-text">
      <header className="relative z-50 flex shrink-0 items-center gap-2 border-b border-border bg-surface/60 px-3 py-2 backdrop-blur sm:px-5">
        <NavLink to="/" className="flex items-center gap-2">
          <img
            src="/anatomed.svg"
            alt=""
            className="size-8"
            width={32}
            height={32}
          />
          <span className="text-sm font-semibold tracking-tight text-text-strong">Anatom3d</span>
        </NavLink>

        {/* Desktop inline nav */}
        <nav className="ml-3 hidden items-center gap-1 md:flex">
          {NAV.map(({ to, labelKey, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  isActive
                    ? 'bg-accent/15 text-accent'
                    : 'text-text-muted hover:bg-surface-2 hover:text-text',
                )
              }
            >
              <Icon size={15} />
              <span>{t(labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        {/* Mobile: dropdown nav */}
        <div ref={navRef} className="relative ml-auto flex items-center gap-1 md:ml-0">
          <button
            onClick={() => setNavOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={navOpen}
            aria-label={t('nav.openNav')}
            className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text transition-colors hover:bg-surface-2 md:hidden"
          >
            {currentNav ? (
              <>
                <currentNav.icon size={15} />
                <span className="max-w-[120px] truncate">{t(currentNav.labelKey)}</span>
              </>
            ) : (
              <Menu size={15} />
            )}
            {navOpen ? (
              <X size={14} className="text-text-muted" />
            ) : (
              <Menu size={14} className="text-text-muted" />
            )}
          </button>

          {navOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl md:hidden"
            >
              {NAV.map(({ to, labelKey, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setNavOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-accent/15 text-accent'
                        : 'text-text hover:bg-surface-2 hover:text-text-strong',
                    )
                  }
                >
                  <Icon size={16} />
                  {t(labelKey)}
                </NavLink>
              ))}
            </div>
          )}

          {user ? (
            (() => {
              const remaining = Math.max(0, DAILY_TOKEN_LIMIT - user.tokensUsedToday);
              const low = remaining <= DAILY_TOKEN_LIMIT * LOW_REMAINING_FRACTION;
              return (
                <NavLink
                  to="/profile"
                  className={({ isActive }) =>
                    cn(
                      'ml-1 flex items-center gap-1.5 rounded-md border border-border bg-surface px-2 py-1.5 text-xs transition-colors hover:bg-surface-2',
                      isActive ? 'text-accent' : 'text-text',
                    )
                  }
                  title={`${user.username} · ${formatTokens(remaining)} / ${formatTokens(DAILY_TOKEN_LIMIT)} ${t('common.aiTokens')}`}
                >
                  <UserIcon size={13} />
                  <span className="hidden max-w-[110px] truncate sm:inline">{user.username}</span>
                  <span
                    className={cn(
                      'flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium',
                      low ? 'bg-warn/15 text-warn' : 'bg-accent/15 text-accent',
                    )}
                  >
                    <Zap size={10} />
                    {formatTokens(remaining)}
                  </span>
                </NavLink>
              );
            })()
          ) : (
            <NavLink
              to="/login"
              className={({ isActive }) =>
                cn(
                  'ml-1 flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs transition-colors hover:bg-surface-2',
                  isActive ? 'text-accent' : 'text-text-muted hover:text-text',
                )
              }
            >
              <LogIn size={13} />
              <span className="hidden sm:inline">{t('nav.login')}</span>
            </NavLink>
          )}

          <button
            onClick={toggleLang}
            aria-label={lang === 'hr' ? t('settings.switchToEn') : t('settings.switchToHr')}
            title={lang === 'hr' ? t('settings.switchToEn') : t('settings.switchToHr')}
            className="ml-1 flex size-8 items-center justify-center rounded-md border border-border bg-surface text-xs font-semibold text-text-muted transition-colors hover:bg-surface-2 hover:text-text-strong"
          >
            {lang === 'hr' ? 'HR' : 'EN'}
          </button>

          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
            title={theme === 'dark' ? t('settings.lightMode') : t('settings.darkMode')}
            className="ml-1 flex size-8 items-center justify-center rounded-md border border-border bg-surface text-text-muted transition-colors hover:bg-surface-2 hover:text-text-strong"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>
      <main className={cn('relative flex-1 overflow-hidden', onHome && 'overflow-y-auto')}>
        <Suspense fallback={<RouteFallback />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center text-text-muted">
      <Loader2 size={20} className="animate-spin" />
    </div>
  );
}
