import { afterAll, describe, expect, it } from 'vitest';
import { createNodeEngine } from './nodeEngine';
import { analysePositions, CancelledError } from '../../src/analysis/analyzer';
import { parseGame } from '../../src/pgn/pgn';
import { MATE_IN_TWO } from '../fixtures/games';

describe('analysePositions', () => {
  const engine = createNodeEngine();
  afterAll(() => engine.dispose());

  it('evaluates every position, reports progress and scores the final mate without the engine', async () => {
    const game = parseGame(MATE_IN_TWO);
    const progress: number[] = [];
    const evals = await analysePositions(game, engine, { depth: 10, onProgress: (d) => progress.push(d) });
    expect(evals).toHaveLength(game.fens.length);
    expect(progress.at(-1)).toBe(game.fens.length);
    const last = evals.at(-1)!;
    expect(last.terminal).toBe(true);
    expect(last.lines[0].eval).toBe(10000); // black is mated: +(10000 − 0)
  });

  it('can be cancelled', async () => {
    const game = parseGame(MATE_IN_TWO);
    const ac = new AbortController();
    const p = analysePositions(game, engine, {
      depth: 10,
      onProgress: (d) => {
        if (d === 2) ac.abort();
      },
      signal: ac.signal,
    });
    await expect(p).rejects.toBeInstanceOf(CancelledError);
    // engine is usable again after a cancel
    const r = await engine.analyse(game.fens[0], 8, 2);
    expect(r.lines.length).toBe(2);
  });
});
