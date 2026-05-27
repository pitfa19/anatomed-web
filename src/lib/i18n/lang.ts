export type Lang = 'hr' | 'en';

const KEY = 'anatom3d_lang';

function isLang(v: unknown): v is Lang {
  return v === 'hr' || v === 'en';
}

function readInitial(): Lang {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(KEY);
  if (isLang(stored)) return stored;
  // No stored preference: default to English. Users can switch to Croatian
  // from the header toggle, and that choice is then persisted.
  return 'en';
}

export function getInitialLang(): Lang {
  return readInitial();
}

export function applyLang(lang: Lang) {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('lang', lang);
  }
}

export function storeLang(lang: Lang) {
  if (typeof window !== 'undefined') localStorage.setItem(KEY, lang);
}

/** Apply the persisted language synchronously before React mounts. */
export function bootstrapLang() {
  applyLang(readInitial());
}
