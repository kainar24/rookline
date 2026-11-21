import { describe, expect, it } from 'vitest';
import { baseCategory, classifyMove, reviewGame, type ClassifyInput } from '../../src/analysis/classify';
import { detectSacrifice, hangingPieces, materialBalance } from '../../src/analysis/material';
import { parseGame } from '../../src/pgn/pgn';
import type { PositionEval } from '../../src/engine/types';
import { QUEEN_BLUNDER } from '../fixtures/games';

describe('base thresholds', () => {
  it.each([
    [0, 'excellent'],
    [2, 'excellent'],
    [2.01, 'good'],
    [5, 'good'],
    [5.5, 'inaccuracy'],
    [10, 'inaccuracy'],
    [10.1, 'mistake'],
    [20, 'mistake'],
    [20.1, 'blunder'],
    [60, 'blunder'],
  ] as const)('loss %s → %s', (loss, cat) => expect(baseCategory(loss, false)).toBe(cat));

  it('engine move is Best regardless of loss', () => expect(baseCategory(3, true)).toBe('best'));
});

const base: ClassifyInput = {
  ply: 20,
  loss: 0,
  isBest: false,
  bookStreak: false,
  winBefore: 50,
  winAfter: 50,
  gap: null,
  sacrifice: false,
  previousCategory: null,
};

describe('special labels', () => {
  it('Book while in the opening streak', () => {
    expect(classifyMove({ ...base, ply: 4, bookStreak: true, loss: 1 })).toBe('book');
    expect(classifyMove({ ...base, ply: 11, bookStreak: true, loss: 1 })).toBe('excellent');
    expect(classifyMove({ ...base, ply: 4, bookStreak: true, loss: 3 })).toBe('good');
  });
  it('Great when the best move is the only good one', () => {
    expect(classifyMove({ ...base, isBest: true, gap: 12 })).toBe('great');
    expect(classifyMove({ ...base, isBest: true, gap: 4 })).toBe('best');
    expect(classifyMove({ ...base, isBest: true, gap: null })).toBe('best');
  });
  it('obvious recaptures and mate-in-one are Best, not Great', () => {
    expect(classifyMove({ ...base, isBest: true, gap: 40, isRecapture: true })).toBe('best');
    expect(classifyMove({ ...base, isBest: true, gap: 40, givesMate: true })).toBe('best');
  });
  it('Brilliant needs a sound sacrifice from a not-yet-winning position', () => {
    expect(classifyMove({ ...base, sacrifice: true, loss: 1, winBefore: 55, winAfter: 56 })).toBe('brilliant');
    expect(classifyMove({ ...base, sacrifice: true, loss: 1, winBefore: 85, winAfter: 86 })).toBe('excellent');
    expect(classifyMove({ ...base, sacrifice: true, loss: 6, winBefore: 55, winAfter: 49 })).toBe('inaccuracy');
    expect(classifyMove({ ...base, sacrifice: true, loss: 1, winBefore: 40, winAfter: 39 })).toBe('excellent');
  });
  it('Miss after an opponent error that is not punished', () => {
    const missIn = { ...base, previousCategory: 'blunder' as const, winBefore: 90, winAfter: 65, loss: 25 };
    expect(classifyMove(missIn)).toBe('miss');
    expect(classifyMove({ ...missIn, previousCategory: 'good' })).toBe('blunder');
    expect(classifyMove({ ...missIn, winAfter: 30, loss: 60 })).toBe('blunder');
  });
});

describe('material helpers', () => {
  it('counts material', () => {
    expect(materialBalance('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(0);
    expect(materialBalance('4k3/8/8/8/8/8/8/3QK3 w - - 0 1')).toBe(9);
  });
  it('detects a piece sacrifice (knight takes a defended pawn)', () => {
    // Legal's mate: 5.Nxe5 — the knight can be taken by the d6 pawn.
    const fen = 'rn1qkbnr/ppp2p1p/3p2p1/4N3/2B1P1b1/2N5/PPPP1PPP/R1BQK2R b KQkq - 0 5';
    expect(detectSacrifice(fen, 'e5', 'p')).toEqual({ piece: 'n', net: -2 });
  });
  it('does not call an even trade a sacrifice', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bb5 a6 4.Bxc6 — bishop for knight, recaptured by a pawn.
    const fen = 'r1bqkbnr/1ppp1ppp/p1B5/4p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 4';
    expect(detectSacrifice(fen, 'c6', 'n')).toBeNull();
  });
  it('finds hanging pieces', () => {
    // White queen on e5 attacked by Nc6 after 3.Qxe5+.
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4Q3/4P3/8/PPPP1PPP/RNB1KBNR b KQkq - 0 3';
    expect(hangingPieces(fen, 'w')[0]).toEqual({ square: 'e5', piece: 'q' });
  });
});

describe('reviewGame with synthetic evals', () => {
  it('classifies the queen blunder and computes accuracy', () => {
    const g = parseGame(QUEEN_BLUNDER);
    // Hand-written evals (white view) for 7 positions, roughly what an engine says.
    const values = [30, 30, 25, -60, -30, -650, -650];
    const best = ['e2e4', 'e7e5', 'g1f3', 'g7g6', 'h5f3', 'c6e5', 'f1c4'];
    const evals: PositionEval[] = g.fens.map((fen, i) => ({
      fen,
      depth: 12,
      lines: [{ multipv: 1, depth: 12, eval: values[i], pv: [best[i]] }],
      bestMove: best[i],
      terminal: false,
    }));
    const r = reviewGame(g, evals);
    expect(r.moves[4].san).toBe('Qxe5+');
    expect(r.moves[4].category).toBe('blunder');
    expect(r.moves[5].category).toBe('best'); // Nxe5 is the engine move
    expect(r.moves[0].category).toBe('book');
    expect(r.counts.w.blunder).toBe(1);
    expect(r.accuracy.w!).toBeLessThan(r.accuracy.b!);
    expect(r.gameRating).toBeNull();
  });
});
