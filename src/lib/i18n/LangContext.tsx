import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import hr from './hr';
import en from './en';
import type { Dict } from './hr';
import { applyLang, getInitialLang, storeLang } from './lang';
import type { Lang } from './lang';

const DICTS: Record<Lang, Dict> = { hr, en };

export interface LangContextValue {
  lang: Lang;
  dict: Dict;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
}

// eslint-disable-next-line react-refresh/only-export-components
export const LangContext = createContext<LangContextValue | null>(null);

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);

  useEffect(() => {
    applyLang(lang);
    storeLang(lang);
  }, [lang]);

  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const toggleLang = useCallback(
    () => setLangState((l) => (l === 'hr' ? 'en' : 'hr')),
    [],
  );

  const value = useMemo<LangContextValue>(
    () => ({ lang, dict: DICTS[lang], setLang, toggleLang }),
    [lang, setLang, toggleLang],
  );

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
