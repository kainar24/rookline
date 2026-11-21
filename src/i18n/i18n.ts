import { ru } from './ru';
import { en } from './en';

export type Lang = 'ru' | 'en';
export type Dict = typeof ru;
export type Key = keyof Dict;

const dicts: Record<Lang, Dict> = { ru, en };
let current: Lang = 'ru';
const listeners = new Set<() => void>();

export function setLang(l: Lang) {
  current = l;
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}
export function getLang(): Lang {
  return current;
}
export function onLangChange(f: () => void) {
  listeners.add(f);
}

/** Translate a key; `{name}` placeholders are replaced from params. */
export function t(key: Key, params?: Record<string, string | number>, lang: Lang = current): string {
  const raw = dicts[lang][key] ?? dicts.ru[key] ?? key;
  const s = Array.isArray(raw) ? raw[0] : raw;
  return params ? fill(s, params) : s;
}

/** Phrase lists (for varied comments). */
export function tList(key: Key, lang: Lang = current): string[] {
  const raw = dicts[lang][key] ?? dicts.ru[key];
  return Array.isArray(raw) ? raw : [raw as string];
}

export function fill(s: string, params: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (_, k) => (k in params ? String(params[k]) : `{${k}}`));
}

/** Russian plural helper: 1 ход, 2 хода, 5 ходов. */
export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}
