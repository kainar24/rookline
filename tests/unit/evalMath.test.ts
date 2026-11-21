import { describe, expect, it } from 'vitest';
import {
  averageAccuracy,
  encodeMate,
  formatEval,
  isMate,
  mateDistance,
  moveAccuracy,
  uciScoreToWhite,
  winPercentFor,
  winPercentWhite,
} from '../../src/analysis/evalMath';

describe('cp → win%', () => {
  it('is 50% at 0 cp', () => expect(winPercentWhite(0)).toBeCloseTo(50, 10));
  it('matches the reference formula', () => {
    const f = (cp: number) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
    for (const cp of [-800, -300, -50, 37, 100, 250, 1000]) expect(winPercentWhite(cp)).toBeCloseTo(f(cp), 10);
  });
  it('+100 cp ≈ 59.1%', () => expect(winPercentWhite(100)).toBeCloseTo(59.1, 1));
  it('is symmetric for the two colours', () => {
    expect(winPercentFor(200, true) + winPercentFor(200, false)).toBeCloseTo(100, 10);
    expect(winPercentFor(-150, false)).toBeCloseTo(winPercentWhite(150), 10);
  });
  it('mate scores saturate near 100 / 0', () => {
    expect(winPercentWhite(encodeMate(3, true))).toBeGreaterThan(99.99);
    expect(winPercentWhite(encodeMate(3, false))).toBeLessThan(0.01);
  });
});

describe('mate encoding', () => {
  it('encodes ±(10000 − N)', () => {
    expect(encodeMate(3, true)).toBe(9997);
    expect(encodeMate(2, false)).toBe(-9998);
    expect(isMate(9997)).toBe(true);
    expect(isMate(850)).toBe(false);
    expect(mateDistance(-9998)).toBe(2);
    expect(mateDistance(120)).toBeNull();
  });
  it('converts UCI side-to-move scores to White perspective', () => {
    expect(uciScoreToWhite('cp', 35, true)).toBe(35);
    expect(uciScoreToWhite('cp', 35, false)).toBe(-35);
    expect(uciScoreToWhite('mate', 2, true)).toBe(9998); // white to move mates in 2
    expect(uciScoreToWhite('mate', 2, false)).toBe(-9998); // black to move mates in 2
    expect(uciScoreToWhite('mate', -1, true)).toBe(-9999); // white gets mated in 1
    expect(uciScoreToWhite('mate', -3, false)).toBe(9997); // black gets mated in 3
  });
  it('formats evaluations', () => {
    expect(formatEval(125)).toBe('+1.25');
    expect(formatEval(-40)).toBe('−0.40');
    expect(formatEval(9997)).toBe('#3');
    expect(formatEval(-9998)).toBe('#-2');
  });
});

describe('accuracy', () => {
  it('is ~100 for zero loss', () => expect(moveAccuracy(0)).toBeCloseTo(99.9999, 3));
  it('follows the Lichess formula', () => {
    expect(moveAccuracy(10)).toBeCloseTo(103.1668 * Math.exp(-0.4354) - 3.1669, 8);
    expect(moveAccuracy(30)).toBeCloseTo(103.1668 * Math.exp(-0.04354 * 30) - 3.1669, 8);
  });
  it('is clamped to 0..100', () => {
    expect(moveAccuracy(100)).toBe(0);
    expect(moveAccuracy(-5)).toBeLessThanOrEqual(100);
  });
  it('averages per move', () => {
    expect(averageAccuracy([0, 100])).toBeCloseTo((moveAccuracy(0) + 0) / 2, 8);
    expect(averageAccuracy([])).toBeNull();
  });
});
