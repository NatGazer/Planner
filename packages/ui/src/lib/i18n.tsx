import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { setFormatLanguage } from './format';
import { en } from './strings/en';
import { pt } from './strings/pt';
import { fr } from './strings/fr';

/**
 * ============================================================================
 *  Three languages, no dependency
 * ============================================================================
 *
 * English, European Portuguese and French. The whole thing is about eighty
 * lines because it only does what this product needs:
 *
 *   • `en` is the source of truth. `pt` and `fr` are typed as
 *     `Record<StringKey, ...>`, so a missing or misspelled translation is a
 *     build error, not a screen that silently falls back to English.
 *   • Plural forms are per-language. French counts zero as singular
 *     ("0 tâche"), Portuguese and English do not ("0 tarefas"). Getting that
 *     wrong is the tell of a machine-translated interface.
 *   • Interpolation is `{name}`, substituted verbatim — no expression
 *     language, nothing to escape.
 *
 * Dates are not here: they live in `format.ts`, which is told the language the
 * same way it is told the business timezone. A due date is not a sentence.
 */

export type Lang = 'en' | 'pt' | 'fr';

export interface LanguageOption {
  code: Lang;
  /** The language's name *in that language* — never "Portuguese" in English. */
  label: string;
  short: string;
  /** For the `lang` attribute and for screen readers. */
  tag: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', short: 'EN', tag: 'en' },
  { code: 'pt', label: 'Português', short: 'PT', tag: 'pt-PT' },
  { code: 'fr', label: 'Français', short: 'FR', tag: 'fr' },
];

export interface Plural { one: string; other: string }
export type Phrase = string | Plural;

export type StringKey = keyof typeof en;
export type Dictionary = Record<StringKey, Phrase>;

const DICTIONARIES: Record<Lang, Dictionary> = { en, pt, fr };

/**
 * Plural category. English and Portuguese: only 1 is singular. French: 0 and 1
 * both are — "0 jour", "1 jour", "2 jours".
 */
const isSingular = (lang: Lang, n: number): boolean =>
  lang === 'fr' ? Math.abs(n) < 2 : Math.abs(n) === 1;

export type Params = Record<string, string | number>;
export type TFunc = (key: StringKey, params?: Params) => string;

const fill = (template: string, params?: Params): string => {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    (name in params ? String(params[name]) : whole));
};

/** Resolve one key in one language, falling back to English if a gap opens. */
export function translate(lang: Lang, key: StringKey, params?: Params): string {
  const phrase: Phrase = DICTIONARIES[lang][key] ?? en[key];
  if (typeof phrase === 'string') return fill(phrase, params);
  const count = Number(params?.count ?? 0);
  return fill(isSingular(lang, count) ? phrase.one : phrase.other, params);
}

/* ------------------------------------------------------------- provider --- */

interface LanguageValue {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: TFunc;
}

const LanguageContext = createContext<LanguageValue | null>(null);
const STORAGE_KEY = 'mm.lang';

const isLang = (v: unknown): v is Lang => v === 'en' || v === 'pt' || v === 'fr';

/**
 * Pick a starting language: what was chosen here before, else what the device
 * asks for, else English. `navigator.languages` is in preference order, so a
 * phone set to pt-PT then en-GB gets Portuguese.
 */
function detect(storageKey: string): Lang {
  try {
    const stored = localStorage.getItem(storageKey);
    if (isLang(stored)) return stored;
  } catch { /* private mode, or storage disabled */ }
  const asked = typeof navigator !== 'undefined'
    ? [...(navigator.languages ?? []), navigator.language] : [];
  for (const tag of asked) {
    const base = String(tag || '').toLowerCase().split('-')[0];
    if (base === 'pt' || base === 'fr' || base === 'en') return base;
  }
  return 'en';
}

export function LanguageProvider({ children, storageKey = STORAGE_KEY }: { children: ReactNode; storageKey?: string }) {
  const [lang, setLangState] = useState<Lang>(() => detect(storageKey));

  // Layout effect, like the theme: `format.ts` is a module, not a hook, and
  // components that format a date while mounting must not render one month
  // in English and re-render it in Portuguese a frame later.
  useLayoutEffect(() => {
    setFormatLanguage(lang);
    const option = LANGUAGES.find((l) => l.code === lang);
    document.documentElement.lang = option ? option.tag : 'en';
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try { localStorage.setItem(storageKey, next); } catch { /* nothing to do */ }
  }, [storageKey]);

  const value = useMemo<LanguageValue>(() => ({
    lang,
    setLang,
    t: (key, params) => translate(lang, key, params),
  }), [lang, setLang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage(): LanguageValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside a LanguageProvider');
  return ctx;
}

/** The common case: just the translate function. */
export function useT(): TFunc {
  return useLanguage().t;
}
