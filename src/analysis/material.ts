import { Chess, type Square } from 'chess.js';
import { CONFIG } from './config';

export function pieceValue(type: string | undefined): number {
  return type ? (CONFIG.pieceValue[type] ?? 0) : 0;
}

/** Material balance in pawns from White's view (kings ignored). */
export function materialBalance(fen: string): number {
  const board = fen.split(' ')[0];
  let s = 0;
  for (const ch of board) {
    const lower = ch.toLowerCase();
    if (!(lower in CONFIG.pieceValue)) continue;
    const v = CONFIG.pieceValue[lower];
    s += ch === lower ? -v : v;
  }
  return s;
}

/**
 * Replay a UCI line from a FEN (stops at the first illegal move) and return the resulting FEN
 * plus the SAN of the moves that were played.
 */
export function playLine(fen: string, uciMoves: string[], maxPlies = Infinity): { fen: string; san: string[] } {
  const c = new Chess(fen);
  const san: string[] = [];
  for (const u of uciMoves.slice(0, maxPlies)) {
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      san.push(m.san);
    } catch {
      break;
    }
  }
  return { fen: c.fen(), san };
}

/**
 * Replay at least `minPlies` of a line, then keep going while the last move was a capture
 * (up to `maxExtra` more plies), so material is not measured in the middle of an exchange.
 */
export function playLineQuiet(fen: string, uciMoves: string[], minPlies: number, maxExtra = 6): string {
  const c = new Chess(fen);
  let i = 0;
  let lastCapture = false;
  for (const u of uciMoves) {
    if (i >= minPlies && (!lastCapture || i >= minPlies + maxExtra)) break;
    try {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      lastCapture = !!m.captured;
    } catch {
      break;
    }
    i++;
  }
  return c.fen();
}

/** SAN of one UCI move in a position, or the UCI string if it cannot be played. */
export function uciToSan(fen: string, uci: string): string {
  return playLine(fen, [uci]).san[0] ?? uci;
}

export interface SacrificeInfo {
  /** The moved piece type (after promotion). */
  piece: string;
  /** Net material for the mover if the opponent takes, in pawns (negative = loses). */
  net: number;
}

/**
 * Did the move put a piece worth ≥ minPieceValue en prise so that taking it wins material?
 * `net` = captured on this move − moved piece value (+ cheapest attacker value if we can recapture).
 */
export function detectSacrifice(
  fenAfter: string,
  to: string,
  capturedOnMove: string | undefined,
): SacrificeInfo | null {
  const c = new Chess(fenAfter);
  const piece = c.get(to as Square);
  if (!piece) return null;
  const value = pieceValue(piece.type);
  if (value < CONFIG.brilliant.minPieceValue) return null;
  const captures = c.moves({ verbose: true }).filter((m) => m.to === to && m.captured);
  if (captures.length === 0) return null;
  const mover = piece.color;
  const defended = c.attackers(to as Square, mover).length > 0;
  // Cheapest legal capturer (king last: it can only capture an undefended piece legally anyway).
  const attackerValues = captures.map((m) => (m.piece === 'k' ? 100 : pieceValue(m.piece)));
  const minAttacker = Math.min(...attackerValues);
  const recapture = defended && minAttacker < 100 ? minAttacker : 0;
  const net = pieceValue(capturedOnMove) - value + recapture;
  if (net > CONFIG.brilliant.maxNetMaterial) return null;
  return { piece: piece.type, net };
}

/**
 * Pieces of `color` that the opponent can capture with a material gain right now
 * (undefended, or attacked by a cheaper piece). Used for "left a piece hanging" comments.
 */
export function hangingPieces(fen: string, color: 'w' | 'b'): Array<{ square: string; piece: string }> {
  const c = new Chess(fen);
  if (c.turn() === color) return []; // only meaningful when the opponent is to move
  const result: Array<{ square: string; piece: string }> = [];
  const seen = new Set<string>();
  for (const m of c.moves({ verbose: true })) {
    if (!m.captured || seen.has(m.to)) continue;
    const target = c.get(m.to as Square);
    if (!target || target.color !== color || target.type === 'p') continue;
    const defended = c.attackers(m.to as Square, color).length > 0;
    if (!defended || pieceValue(m.piece) < pieceValue(target.type)) {
      seen.add(m.to);
      result.push({ square: m.to, piece: target.type });
    }
  }
  return result.sort((a, b) => pieceValue(b.piece) - pieceValue(a.piece));
}
