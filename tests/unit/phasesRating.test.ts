import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Chess } from 'chess.js';
import { phaseOfPlies, majorsAndMinors } from '../../src/analysis/phases';
import { estimateGameRating, expectedAccuracy } from '../../src/analysis/rating';
import { makeBook } from '../../src/analysis/openings';
import { playerAccuracy, volatilityWeights } from '../../src/analysis/evalMath';

const fensOf = (sans: string[]) => {
  const c = new Chess();
  return [c.fen(), ...sans.map((s) => (c.move(s), c.fen()))];
};

describe('opening book', () => {
  const book = makeBook(JSON.parse(readFileSync('src/analysis/openings.json', 'utf8')));
  it('knows main lines and names them', () => {
    const f = fensOf(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5']);
    expect(f.slice(1).every((x) => book.has(x))).toBe(true);
    expect(book.name(f[5])).toMatch(/Ruy Lopez/);
  });
  it('rejects odd moves', () => {
    expect(book.has(fensOf(['e4', 'e5', 'Ke2', 'Ke7', 'Ke1'])[5])).toBe(false);
  });
});

describe('phases', () => {
  it('counts pieces', () => expect(majorsAndMinors(new Chess().fen())).toBe(14));
  it('starts in the opening and reaches the endgame when pieces come off', () => {
    const endFen = '4k3/8/8/8/8/8/4P3/R3K2R w KQ - 0 1';
    const ph = phaseOfPlies([new Chess().fen(), new Chess().fen(), endFen], 0);
    expect(ph).toEqual(['opening', 'endgame']);
  });
  it('the opening lasts at most openingMaxPly plies', () => {
    const start = new Chess().fen();
    const ph = phaseOfPlies(Array(40).fill(start), 0);
    expect(ph[10]).toBe('opening');
    expect(ph.at(-1)).toBe('middlegame');
  });
});

describe('game accuracy and rating', () => {
  it('one bad move pulls the game accuracy below the plain average', () => {
    const accs = [100, 100, 20, 100];
    expect(playerAccuracy(accs, [1, 1, 1, 1])!).toBeLessThan(80);
    expect(playerAccuracy([100, 100], [1, 1])).toBeCloseTo(100, 6);
    expect(playerAccuracy([], [])).toBeNull();
  });
  it('weights are one per move', () => expect(volatilityWeights([50, 52, 40, 60, 55])).toHaveLength(4));
  it('rating follows accuracy around the player Elo', () => {
    const exp = expectedAccuracy(1000);
    expect(estimateGameRating(exp, 1000)).toBe(1000);
    expect(estimateGameRating(exp + 10, 1000)!).toBeGreaterThan(1000);
    expect(estimateGameRating(exp - 10, 1000)!).toBeLessThan(1000);
    expect(estimateGameRating(null, 1000)).toBeNull();
    expect(estimateGameRating(99, undefined)!).toBeLessThanOrEqual(3200);
  });
});
