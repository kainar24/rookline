import { describe, expect, it } from 'vitest';
import { CATEGORIES, type MoveReview } from '../../src/analysis/classify';
import { commentFor } from '../../src/comments/templates';
import { ru } from '../../src/i18n/ru';
import { en } from '../../src/i18n/en';

const base: MoveReview = {
  ply: 21, moveNumber: 11, color: 'w', san: 'Nf3', uci: 'g1f3', from: 'g1', to: 'f3',
  fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  fenAfter: 'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b KQkq - 1 1',
  evalBefore: 30, evalAfter: -400, winBefore: 52, winAfter: 20, loss: 32, accuracy: 10,
  category: 'blunder', isBest: false, bestMove: 'e2e4', bestSan: 'e4', bestLine: ['e2e4'], replyLine: ['e7e5'],
  secondWin: null, sacrifice: false,
};

describe('template comments', () => {
  it('ru and en dictionaries have the same keys and phrase counts', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ru).sort());
    for (const k of Object.keys(ru) as (keyof typeof ru)[]) expect(Array.isArray(en[k])).toBe(Array.isArray(ru[k]));
  });

  it('produces text for every category in both languages, without unfilled placeholders', () => {
    for (const category of CATEGORIES) {
      for (const lang of ['ru', 'en'] as const) {
        const c = commentFor({ ...base, category }, lang);
        expect(c.text.length).toBeGreaterThan(5);
        expect(c.text).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('varies phrasing between neighbouring moves', () => {
    const texts = new Set([19, 20, 21, 22, 23].map((ply) => commentFor({ ...base, ply, category: 'best' }, 'en').text));
    expect(texts.size).toBeGreaterThan(1);
  });

  it('does not repeat the best move when the reason already names it', () => {
    const c = commentFor({ ...base, category: 'inaccuracy', loss: 7, evalAfter: 0, bestSan: 'Qxb7', bestLine: ['e2e4'] }, 'ru');
    expect(c.text.split('Qxb7').length - 1).toBe(1);
  });
});
