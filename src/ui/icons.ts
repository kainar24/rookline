import type { Category } from '../analysis/classify';
import { svgFromString } from './dom';

/**
 * Round category badges with standard chess annotation glyphs (!!, !, ?!, ?, ??)
 * and simple hand-drawn symbols. Colours come from CSS variables (styles.css).
 */
const T = (txt: string, size = 11, dx = 0) =>
  `<text x="${12 + dx}" y="16.2" text-anchor="middle" font-size="${size}" font-weight="800" font-family="system-ui,-apple-system,Segoe UI,sans-serif" fill="#fff" letter-spacing="-0.8">${txt}</text>`;

const GLYPHS: Record<Category, string> = {
  brilliant: T('!!', 11.5),
  great: T('!', 13),
  // five-point star
  best: '<path d="M12 5.2l2 4.2 4.6.6-3.4 3.2.9 4.6L12 15.6l-4.1 2.2.9-4.6-3.4-3.2 4.6-.6z" fill="#fff"/>',
  // thumbs up
  excellent:
    '<path d="M7 11h2.2v6.6H7zM10.3 17.6V11.2l2.6-4.4c.9-.2 1.6.5 1.4 1.5l-.5 2.5h3.1c.9 0 1.5.8 1.3 1.7l-1 4.1c-.2.6-.7 1-1.3 1z" fill="#fff"/>',
  good: '<path d="M7.2 12.4l3.2 3.2 6.4-6.6" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
  book: '<path d="M6.2 7.6c2.2-.7 4.1-.4 5.8.9 1.7-1.3 3.6-1.6 5.8-.9v8.8c-2.2-.7-4.1-.4-5.8.9-1.7-1.3-3.6-1.6-5.8-.9z" fill="#fff"/><path d="M12 8.6v8.6" stroke="var(--cat-book)" stroke-width="1.3"/>',
  inaccuracy: T('?!', 10.5),
  mistake: T('?', 13),
  miss: '<path d="M8.4 8.4l7.2 7.2M15.6 8.4l-7.2 7.2" stroke="#fff" stroke-width="2.7" stroke-linecap="round"/>',
  blunder: T('??', 10.5),
};

export function categoryIconMarkup(cat: Category, size = 20): string {
  return `<svg class="cat-icon" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="var(--cat-${cat})"/>${GLYPHS[cat]}</svg>`;
}

export function categoryIcon(cat: Category, size = 20): SVGSVGElement {
  return svgFromString(categoryIconMarkup(cat, size));
}

/** Inner SVG content (no outer <svg>) for placing a badge inside the board SVG. */
export function categoryBadgeInner(cat: Category): string {
  return `<circle cx="12" cy="12" r="11" fill="var(--cat-${cat})" stroke="rgba(0,0,0,.25)" stroke-width="1"/>${GLYPHS[cat]}`;
}

/** Small UI icons (stroke style). */
export const UI = {
  first: '<path d="M6 6v12M18 6l-7 6 7 6" />',
  prev: '<path d="M15 6l-6 6 6 6" />',
  next: '<path d="M9 6l6 6-6 6" />',
  last: '<path d="M18 6v12M6 6l7 6-7 6" />',
  flip: '<path d="M7 4v14M4 15l3 3 3-3M17 20V6M14 9l3-3 3 3" />',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  moon: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  stop: '<rect x="7" y="7" width="10" height="10" rx="1.5"/>',
  spark: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/>',
  back: '<path d="M10 6l-6 6 6 6M4 12h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  retry: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/>',
  star: '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4L12 16.3 7.2 19l1-5.4-4-3.8 5.4-.7z"/>',
  chevron: '<path d="M6 9l6 6 6-6" />',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
} as const;

export function uiIcon(name: keyof typeof UI, size = 20): SVGSVGElement {
  return svgFromString(
    `<svg class="ui-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI[name]}</svg>`,
  );
}

/** Brand mark: a rook. */
export const BRAND_MARK = `<svg class="brand-mark" width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="rl-tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9bd05f"/><stop offset="1" stop-color="#5e9631"/></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#rl-tile)"/><path d="M10.2 5.5h2.7v2.4h1.8V5.5h2.6v2.4h1.8V5.5h2.7v4.6l-2 1.9v5.6l2 1.9v2.1H10.2V19.5l2-1.9V12l-2-1.9z" fill="#fff"/><path d="M4.5 27l5.8-3 4.6 1.6 5.6-4 6.9 2.6" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20.5" cy="21.6" r="1.7" fill="#fff"/></svg>`;

/** Generic avatar (pawn silhouette) for player strips and the coach. */
export function avatar(color: 'w' | 'b' | 'coach', size = 36): SVGSVGElement {
  const bg = color === 'w' ? '#e8e6e1' : color === 'b' ? '#3c3a37' : 'var(--brand)';
  const fg = color === 'w' ? '#8b8987' : color === 'b' ? '#9a9895' : '#fff';
  return svgFromString(
    `<svg class="avatar" width="${size}" height="${size}" viewBox="0 0 36 36" aria-hidden="true"><rect width="36" height="36" rx="4" fill="${bg}"/><circle cx="18" cy="12.5" r="5" fill="${fg}"/><path d="M12.5 29c0-5 2.2-8.6 5.5-9.6 3.3 1 5.5 4.6 5.5 9.6z" fill="${fg}"/><rect x="10" y="28" width="16" height="3" rx="1.5" fill="${fg}"/></svg>`,
  );
}
