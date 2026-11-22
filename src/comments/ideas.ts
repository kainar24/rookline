import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import { pieceValue } from '../analysis/material';

/** What a move does on the board, found from the position alone (no engine needed). */
export type Idea =
  | { kind: 'castle'; side: 'k' | 'q' }
  | { kind: 'promote'; piece: PieceSymbol }
  | { kind: 'fork'; piece: PieceSymbol; targets: [PieceSymbol, PieceSymbol] }
  | { kind: 'tradeQueens' }
  | { kind: 'recapture'; captured: PieceSymbol }
  | { kind: 'freeCapture'; captured: PieceSymbol; square: string }
  | { kind: 'capture'; captured: PieceSymbol; square: string }
  | { kind: 'attack'; target: PieceSymbol; square: string }
  | { kind: 'check' }
  | { kind: 'escapeCheck' }
  | { kind: 'blockCheck' }
  | { kind: 'defend'; target: PieceSymbol; square: string }
  | { kind: 'escape'; piece: PieceSymbol }
  | { kind: 'develop'; piece: PieceSymbol; square: string }
  | { kind: 'center' }
  | { kind: 'passedPawn' }
  | { kind: 'kingActive' }
  | { kind: 'openFile'; file: string }
  | { kind: 'none' };

export interface IdeaContext {
  /** Square where the opponent just captured (for "takes back"); null if their last move was not a capture. */
  recaptureSquare?: string | null;
  endgame?: boolean;
  opening?: boolean;
}

const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');

/** Enemy pieces (not the king) that the piece on `from` attacks and that are worth going after. */
function juicyTargets(c: Chess, from: Square, me: Color): { sq: Square; type: PieceSymbol }[] {
  const mine = c.get(from);
  if (!mine) return [];
  const out: { sq: Square; type: PieceSymbol }[] = [];
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.color === me || p.type === 'k' || p.type === 'p') continue;
      if (!c.attackers(p.square, me).includes(from)) continue;
      const defended = c.attackers(p.square, other(me)).length > 0;
      if (pieceValue(p.type) > pieceValue(mine.type) || !defended) out.push({ sq: p.square, type: p.type });
    }
  }
  return out.sort((a, b) => pieceValue(b.type) - pieceValue(a.type));
}

function isPassed(c: Chess, sq: Square, me: Color): boolean {
  const file = sq.charCodeAt(0);
  const rank = Number(sq[1]);
  for (let f = file - 1; f <= file + 1; f++) {
    if (f < 97 || f > 104) continue;
    for (let r = 1; r <= 8; r++) {
      const ahead = me === 'w' ? r > rank : r < rank;
      if (!ahead) continue;
      const p = c.get(`${String.fromCharCode(f)}${r}` as Square);
      if (p && p.type === 'p' && p.color !== me) return false;
    }
  }
  return true;
}

function fileIsOpen(c: Chess, file: string): boolean {
  for (let r = 1; r <= 8; r++) {
    const p = c.get(`${file}${r}` as Square);
    if (p && p.type === 'p') return false;
  }
  return true;
}

/** Describe the move `uci` played from `fen`. Returns the most telling idea first. */
export function describeMove(fen: string, uci: string, ctx: IdeaContext = {}): Idea {
  const before = new Chess(fen);
  const me = before.turn();
  const from = uci.slice(0, 2) as Square;
  const to = uci.slice(2, 4) as Square;
  let mv;
  try {
    mv = before.move({ from, to, promotion: uci[4] as PieceSymbol | undefined });
  } catch {
    return { kind: 'none' };
  }
  const start = new Chess(fen);
  const after = new Chess(mv.after);

  if (mv.isKingsideCastle()) return { kind: 'castle', side: 'k' };
  if (mv.isQueensideCastle()) return { kind: 'castle', side: 'q' };
  if (mv.promotion) return { kind: 'promote', piece: mv.promotion };

  if (mv.captured === 'q' && mv.piece === 'q') return { kind: 'tradeQueens' };
  if (start.inCheck() && !mv.captured) return mv.piece === 'k' ? { kind: 'escapeCheck' } : { kind: 'blockCheck' };

  const targets = juicyTargets(after, to, me);
  const check = after.inCheck();
  // A double attack only counts when the attacker cannot simply be taken for free or by a cheaper piece.
  const hitters = after.attackers(to, other(me));
  const cheapestHitter = Math.min(...hitters.map((sq) => pieceValue(after.get(sq)?.type)));
  const attackerSafe = hitters.length === 0 || (after.attackers(to, me).length > 0 && cheapestHitter >= pieceValue(mv.piece));
  if (attackerSafe && (targets.length >= 2 || (check && targets.length >= 1 && pieceValue(targets[0].type) >= 3))) {
    const t2 = check ? 'k' : targets[1].type;
    return { kind: 'fork', piece: mv.piece, targets: [targets[0].type, t2] };
  }

  if (mv.captured) {
    if (ctx.recaptureSquare === to) return { kind: 'recapture', captured: mv.captured };
    const defended = start.attackers(to, other(me)).length > 0;
    if (!defended) return { kind: 'freeCapture', captured: mv.captured, square: to };
    return { kind: 'capture', captured: mv.captured, square: to };
  }

  if (targets.length === 1) return { kind: 'attack', target: targets[0].type, square: targets[0].sq };
  if (check) return { kind: 'check' };

  // Defends a piece that was hanging (attacked and not defended) before the move.
  for (const row of after.board()) {
    for (const p of row) {
      if (!p || p.color !== me || p.type === 'k' || p.type === 'p' || p.square === to) continue;
      const attacked = after.attackers(p.square, other(me)).length > 0;
      const wasDefended = start.attackers(p.square, me).length > 0;
      if (attacked && !wasDefended && after.attackers(p.square, me).includes(to)) {
        return { kind: 'defend', target: p.type, square: p.square };
      }
    }
  }

  // The moved piece was under attack and is safe now.
  if (mv.piece !== 'p' && mv.piece !== 'k') {
    const threats = start.attackers(from, other(me));
    const cheapest = Math.min(...threats.map((s) => pieceValue(start.get(s)?.type)));
    const wasInDanger = threats.length > 0 && (cheapest < pieceValue(mv.piece) || start.attackers(from, me).length === 0);
    if (wasInDanger && after.attackers(to, other(me)).length === 0) return { kind: 'escape', piece: mv.piece };
  }

  const homeRank = me === 'w' ? '1' : '8';
  if ((mv.piece === 'n' || mv.piece === 'b') && from[1] === homeRank) return { kind: 'develop', piece: mv.piece, square: to };
  if (mv.piece === 'p') {
    if (ctx.opening && ['d4', 'e4', 'd5', 'e5', 'c4', 'c5'].includes(to)) return { kind: 'center' };
    const advanced = me === 'w' ? Number(to[1]) >= 5 : Number(to[1]) <= 4;
    if (isPassed(after, to, me) && (ctx.endgame || advanced)) {
      return { kind: 'passedPawn' };
    }
  }
  if (mv.piece === 'k' && ctx.endgame && !start.inCheck()) {
    const centre = (sq: string) => Math.abs(sq.charCodeAt(0) - 100.5) + Math.abs(Number(sq[1]) - 4.5);
    if (centre(to) < centre(from)) return { kind: 'kingActive' };
  }
  if (mv.piece === 'r' && from[0] !== to[0] && fileIsOpen(after, to[0])) return { kind: 'openFile', file: to[0] };
  return { kind: 'none' };
}
