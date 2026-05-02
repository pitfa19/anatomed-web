import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';
const KEY = 'anatom3d_theme';

function readInitial(): Theme {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem(KEY) as Theme | null;
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
}

export function useTheme(): [Theme, (t: Theme) => void, () => void] {
  const [theme, setThemeState] = useState<Theme>(readInitial);

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return [theme, setThemeState, () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark'))];
}

/** Apply theme synchronously before React mounts to avoid a flash. */
export function bootstrapTheme() {
  applyTheme(readInitial());
}
