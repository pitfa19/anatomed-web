import { useContext } from 'react';
import { LangContext } from './LangContext';
import type { Dict } from './hr';
import type { Lang } from './lang';

// Dictionaries are exactly two levels deep: `area.key`. This produces the
// union of all valid dot-paths (e.g. 'nav.home') for compile-time safety.
export type TKey = {
  [A in keyof Dict]: `${A & string}.${keyof Dict[A] & string}`;
}[keyof Dict];

type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

export function translate(dict: Dict, key: TKey, vars?: Vars): string {
  const [area, leaf] = key.split('.') as [keyof Dict, string];
  const group = dict[area] as Record<string, string> | undefined;
  const value = group?.[leaf];
  if (typeof value !== 'string') {
    if (import.meta.env?.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  return interpolate(value, vars);
}

export interface TFn {
  (key: TKey, vars?: Vars): string;
  lang: Lang;
}

export function useLang() {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error('useLang must be used within <LangProvider>');
  return ctx;
}

export function useT(): TFn {
  const { dict, lang } = useLang();
  const t = ((key: TKey, vars?: Vars) => translate(dict, key, vars)) as TFn;
  t.lang = lang;
  return t;
}

/**
 * Pick a plural form by count. Croatian has three forms:
 *   one  → n % 10 === 1 && n % 100 !== 11            (1, 21, 31…)
 *   few  → n % 10 in 2..4 && n % 100 not in 12..14    (2, 3, 4, 22…)
 *   many → everything else                            (0, 5–20, 25…)
 * English uses `one` for 1 and `many` otherwise (`few` falls back to `many`).
 */
export function plural(
  lang: Lang,
  n: number,
  forms: { one: string; few?: string; many: string },
): string {
  if (lang === 'en') return n === 1 ? forms.one : forms.many;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms.one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return forms.few ?? forms.many;
  }
  return forms.many;
}
