import { afterAll, describe, expect, it } from 'vitest';
import { createNodeEngine } from './nodeEngine';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('Stockfish engine', () => {
  const engine = createNodeEngine();
  afterAll(() => engine.dispose());

  it('evaluates the starting position with two lines', async () => {
    const r = await engine.analyse(START, 10, 2);
    expect(r.terminal).toBe(false);
    expect(r.lines.length).toBe(2);
    expect(r.lines[0].depth).toBeGreaterThanOrEqual(10);
    // Opening position is roughly equal: within one pawn.
    expect(Math.abs(r.lines[0].eval)).toBeLessThan(100);
    expect(r.bestMove).toMatch(/^[a-h][1-8][a-h][1-8]$/);
  });
});
