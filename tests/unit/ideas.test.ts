import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { describeMove } from '../../src/comments/ideas';
import { ideaText } from '../../src/comments/templates';

const fenAfter = (sans: string[]) => {
  const c = new Chess();
  for (const s of sans) c.move(s);
  return c.fen();
};

describe('what a move does', () => {
  it('development, centre and castling', () => {
    expect(describeMove(new Chess().fen(), 'g1f3').kind).toBe('develop');
    expect(describeMove(new Chess().fen(), 'e2e4', { opening: true }).kind).toBe('center');
    const f = fenAfter(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']);
    expect(describeMove(f, 'e1g1')).toEqual({ kind: 'castle', side: 'k' });
  });
  it('a knight fork on the king and rook', () => {
    expect(describeMove('r3k3/8/8/1N6/8/8/8/4K3 w - - 0 1', 'b5c7').kind).toBe('fork');
  });
  it('free capture vs recapture vs queen trade', () => {
    expect(describeMove('4k3/8/8/3p4/8/8/8/3QK3 w - - 0 1', 'd1d5').kind).toBe('freeCapture');
    expect(describeMove('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', 'e4d5', { recaptureSquare: 'd5' }).kind).toBe('recapture');
    expect(describeMove('3qk3/8/8/8/8/8/8/3QK3 w - - 0 1', 'd1d8').kind).toBe('tradeQueens');
  });
  it('getting out of check', () => {
    expect(describeMove('4k3/8/8/8/8/8/8/r3K3 w - - 0 1', 'e1e2').kind).toBe('escapeCheck');
  });
  it('turns ideas into sentences in both languages, no unfilled placeholders', () => {
    const idea = describeMove(new Chess().fen(), 'g1f3');
    expect(ideaText(idea, 'en', 0)).toMatch(/knight/);
    expect(ideaText(idea, 'ru', 0)).toMatch(/кон/);
    expect(ideaText({ kind: 'none' }, 'ru', 0)).toBe('');
    for (const lang of ['en', 'ru'] as const) {
      const fork = ideaText({ kind: 'fork', piece: 'n', targets: ['r', 'k'] }, lang, 1);
      expect(fork).not.toMatch(/\{\w+\}/);
    }
  });
});
