import { Chess } from 'chess.js';
import type { PositionEval } from '../engine/types';
import { MATE_BASE } from './evalMath';

/**
 * Score checkmate, stalemate and dead-draw positions without the engine.
 * Returns null when the position needs a search.
 */
export function terminalEval(fen: string, depth: number): PositionEval | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }
  let value: number | null = null;
  if (chess.isCheckmate()) {
    // Side to move is mated: mate in 0 against it.
    value = chess.turn() === 'w' ? -MATE_BASE : MATE_BASE;
  } else if (chess.isStalemate() || chess.isInsufficientMaterial()) {
    value = 0;
  }
  if (value === null) return null;
  return {
    fen,
    depth,
    lines: [{ multipv: 1, depth, eval: value, pv: [] }],
    bestMove: null,
    terminal: true,
  };
}
