import type { MoveReview } from '../analysis/classify';
import { CONFIG } from '../analysis/config';
import { mateDistance } from '../analysis/evalMath';
import { materialBalance, pieceValue, playLine, playLineQuiet } from '../analysis/material';
import { Chess, type Square } from 'chess.js';

/** Why a move got its label, determined purely from engine data. */
export type Reason =
  | { kind: 'mateDelivered' }
  | { kind: 'keepsMate'; n: number }
  | { kind: 'allowsMate'; n: number }
  | { kind: 'missedMate'; n: number }
  | { kind: 'hangsMoved'; piece: string; square: string; reply: string }
  | { kind: 'hangsOther'; piece: string; square: string; reply: string }
  | { kind: 'losesMaterial'; pawns: number }
  | { kind: 'missedCapture' }
  | { kind: 'missedCheck' }
  | { kind: 'positional' }
  | { kind: 'none' };

/** Mate distance in moves for the side `forWhite`, or null. */
function mateFor(evalWhite: number, forWhite: boolean): number | null {
  const n = mateDistance(evalWhite);
  if (n === null) return null;
  return evalWhite > 0 === forWhite ? n : null;
}

/** Material (pawns, mover's view) after replaying the best line vs. the played move + reply line. */
export function materialDelta(m: MoveReview): number {
  const white = m.color === 'w';
  const sign = white ? 1 : -1;
  const plies = CONFIG.comments.pvPlies;
  const best = playLineQuiet(m.fenBefore, m.bestLine, plies);
  const played = playLineQuiet(m.fenAfter, m.replyLine, plies - 1);
  return sign * (materialBalance(best) - materialBalance(played));
}

export function findReason(m: MoveReview): Reason {
  const white = m.color === 'w';
  if (m.san.endsWith('#')) return { kind: 'mateDelivered' };

  const good = ['brilliant', 'great', 'best', 'excellent', 'good', 'book'].includes(m.category);
  if (good) {
    // Count the move itself: after it the mover still mates in n, so it "leads to mate in n + 1".
    const n = mateFor(m.evalAfter, white);
    if (n !== null && n > 0) return { kind: 'keepsMate', n: n + 1 };
    return { kind: 'none' };
  }

  // 1. allows mate
  const oppMate = mateFor(m.evalAfter, !white);
  const alreadyMated = mateFor(m.evalBefore, !white) !== null;
  if (oppMate !== null && !alreadyMated) return { kind: 'allowsMate', n: oppMate };

  // 2. missed mate
  const hadMate = mateFor(m.evalBefore, white);
  const stillMate = mateFor(m.evalAfter, white);
  if (hadMate !== null && stillMate === null) return { kind: 'missedMate', n: hadMate };

  // Engine evaluation drop for the mover, in centipawns (mate scores capped).
  const cap = (v: number) => Math.max(-2000, Math.min(2000, v));
  const cpDrop = (white ? 1 : -1) * (cap(m.evalBefore) - cap(m.evalAfter));
  const cc = CONFIG.comments;
  // Material vs best line, but never more than the evaluation says was lost.
  const delta = Math.min(materialDelta(m), cpDrop / cc.cpPerPawn);

  // 3. a piece is left hanging: the opponent's best reply captures something valuable for profit
  const reply = m.replyLine[0];
  if (reply && delta >= cc.materialLoss && cpDrop >= cc.hangingMinDropCp) {
    const c = new Chess(m.fenAfter);
    const target = c.get(reply.slice(2, 4) as Square);
    if (target && target.color === m.color && pieceValue(target.type) >= 3) {
      const replySan = playLine(m.fenAfter, [reply]).san[0] ?? reply;
      const square = reply.slice(2, 4);
      return square === m.to
        ? { kind: 'hangsMoved', piece: target.type, square, reply: replySan }
        : { kind: 'hangsOther', piece: target.type, square, reply: replySan };
    }
  }

  // 4. material simply lost vs best line
  if (delta >= cc.materialLoss && cpDrop >= cc.minMaterialDropCp) {
    return { kind: 'losesMaterial', pawns: Math.max(1, Math.round(delta)) };
  }

  // 5. missed tactic
  if (m.bestSan?.includes('x')) return { kind: 'missedCapture' };
  if (m.bestSan?.includes('+')) return { kind: 'missedCheck' };

  return { kind: 'positional' };
}
