import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createNodeEngine } from './nodeEngine';
import { analysePositions } from '../../src/analysis/analyzer';
import { reviewGame } from '../../src/analysis/classify';
import { CONFIG } from '../../src/analysis/config';
import { makeBook } from '../../src/analysis/openings';
import { parseGame } from '../../src/pgn/pgn';
import { CHESSCOM_RAPID, CHESSCOM_RAPID_ACCURACY } from '../fixtures/games';

describe('accuracy matches chess.com on a real game', () => {
  const engine = createNodeEngine();
  afterAll(() => engine.dispose());

  it('lands within 3 points of the published accuracies at the default depth', async () => {
    const game = parseGame(CHESSCOM_RAPID);
    const evals = await analysePositions(game, engine, { depth: CONFIG.depth.default });
    const book = makeBook(JSON.parse(readFileSync('src/analysis/openings.json', 'utf8')));
    const r = reviewGame(game, evals, { book });
    expect(Math.abs(r.accuracy.w! - CHESSCOM_RAPID_ACCURACY.w)).toBeLessThan(3);
    expect(Math.abs(r.accuracy.b! - CHESSCOM_RAPID_ACCURACY.b)).toBeLessThan(3);
    expect(r.opening).toMatch(/C20/);
    expect(r.moves.slice(0, 4).every((m) => m.category === 'book')).toBe(true);
    expect(r.moves.at(-1)!.category).toBe('best'); // 37...b6#
    expect(r.gameRating.b!).toBeGreaterThan(r.gameRating.w!);
    for (const ph of ['opening', 'middlegame', 'endgame'] as const) expect(r.phases[ph].w).not.toBeNull();
    // chess.com's own report for this game: Mistake 6/1, Miss 1/1, Blunder 1/1, Game Rating 700/1250.
    expect(r.counts.w.blunder).toBe(1);
    expect(r.counts.b.blunder).toBe(1);
    expect(r.counts.w.miss).toBe(1);
    expect(r.counts.b.miss).toBe(1);
    expect(r.counts.b.mistake).toBe(1);
    expect(r.counts.w.mistake).toBeGreaterThanOrEqual(4);
    expect(Math.abs(r.gameRating.w! - 700)).toBeLessThanOrEqual(150);
    expect(Math.abs(r.gameRating.b! - 1250)).toBeLessThanOrEqual(150);
  }, 300_000);
});
