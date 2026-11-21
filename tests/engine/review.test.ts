import { afterAll, describe, expect, it } from 'vitest';
import { createNodeEngine } from './nodeEngine';
import { analysePositions } from '../../src/analysis/analyzer';
import { reviewGame } from '../../src/analysis/classify';
import { parseGame } from '../../src/pgn/pgn';
import { MATE_IN_TWO, QUEEN_BLUNDER } from '../fixtures/games';
import { commentFor } from '../../src/comments/templates';

describe('review on the real engine', () => {
  const engine = createNodeEngine();
  afterAll(() => engine.dispose());

  it('marks a hung queen as a Blunder', async () => {
    const game = parseGame(QUEEN_BLUNDER);
    const evals = await analysePositions(game, engine, { depth: 13 });
    const review = reviewGame(game, evals);
    const qxe5 = review.moves.find((m) => m.san === 'Qxe5+')!;
    expect(qxe5.category).toBe('blunder');
    expect(review.counts.w.blunder).toBe(1);
    expect(review.accuracy.w!).toBeLessThan(review.accuracy.b!);
  });

  it("handles Legal's mate: the bishop grab allows mate, final move is mate", async () => {
    const game = parseGame(MATE_IN_TWO);
    const evals = await analysePositions(game, engine, { depth: 13 });
    const review = reviewGame(game, evals);
    const grab = review.moves[9];
    expect(grab.san).toBe('Bxd1');
    expect(grab.category).toBe('blunder');
    expect(grab.evalAfter).toBe(9998); // white mates in 2
    expect(review.moves.at(-1)!.san).toBe('Nd5#');
  });
});

describe('template comments on the real engine', () => {
  const engine = createNodeEngine();
  afterAll(() => engine.dispose());

  it('explains that the bishop grab allows mate in 2 (RU and EN)', async () => {
    const game = parseGame(MATE_IN_TWO);
    const review = reviewGame(game, await analysePositions(game, engine, { depth: 13 }));
    const grab = review.moves[9];
    const ru = commentFor(grab, 'ru');
    const en = commentFor(grab, 'en');
    expect(ru.reason).toEqual({ kind: 'allowsMate', n: 2 });
    expect(ru.text).toMatch(/мат в 2/);
    expect(en.text).toMatch(/mate in 2/);
    expect(commentFor(review.moves.at(-1)!, 'en').reason.kind).toBe('mateDelivered');
    // the move before mate keeps a forced mate
    expect(commentFor(review.moves[10], 'en').reason).toEqual({ kind: 'keepsMate', n: 2 });
  });

  it('says the queen was left hanging', async () => {
    const game = parseGame(QUEEN_BLUNDER);
    const review = reviewGame(game, await analysePositions(game, engine, { depth: 13 }));
    const c = commentFor(review.moves[4], 'en');
    expect(c.reason).toMatchObject({ kind: 'hangsMoved', piece: 'q', square: 'e5' });
    expect(c.text).toMatch(/queen/);
  });
});
