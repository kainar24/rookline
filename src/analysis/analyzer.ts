import type { Engine, PositionEval } from '../engine/types';
import type { ParsedGame } from '../pgn/pgn';
import { CONFIG } from './config';

export interface AnalyseOptions {
  depth: number;
  multiPv?: number;
  /** Called after each position: done = positions finished, total = fens.length. */
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
  }
}

/**
 * Evaluate every position of the game (before each move and after the last one).
 * The engine itself runs in a Web Worker; this loop only awaits results.
 */
export async function analysePositions(
  game: ParsedGame,
  engine: Engine,
  opts: AnalyseOptions,
): Promise<PositionEval[]> {
  const multiPv = opts.multiPv ?? CONFIG.multiPv;
  const out: PositionEval[] = [];
  const total = game.fens.length;
  const onAbort = () => engine.cancel();
  opts.signal?.addEventListener('abort', onAbort, { once: true });
  try {
    opts.onProgress?.(0, total);
    for (let i = 0; i < total; i++) {
      if (opts.signal?.aborted) throw new CancelledError();
      let r: PositionEval;
      try {
        r = await engine.analyse(game.fens[i], opts.depth, multiPv);
      } catch (e) {
        if (opts.signal?.aborted) throw new CancelledError();
        throw e;
      }
      out.push(r);
      opts.onProgress?.(i + 1, total);
    }
    return out;
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
  }
}
