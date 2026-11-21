import { CONFIG } from './analysis/config';
import type { Lang } from './i18n/i18n';

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  lang: Lang;
  theme: ThemePref;
  depth: number;
  /** Claude API key: kept in localStorage only, sent only to api.anthropic.com. */
  apiKey: string;
  model: string;
}

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
const KEY = 'rookline.settings.v1';

function defaults(): Settings {
  const lang: Lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('ru') ? 'ru' : 'en';
  return { lang, theme: 'dark', depth: CONFIG.depth.default, apiKey: '', model: DEFAULT_MODEL };
}

export function loadSettings(): Settings {
  const d = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = { ...d, ...JSON.parse(raw) } as Settings;
    s.depth = Math.min(CONFIG.depth.max, Math.max(CONFIG.depth.min, Number(s.depth) || d.depth));
    if (s.lang !== 'ru' && s.lang !== 'en') s.lang = d.lang;
    return s;
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode: settings live for this session only */
  }
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

/** The theme actually shown right now. */
export function effectiveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
