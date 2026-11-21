import { CONFIG } from './config';

/** Encoded value of "mate in N" for the side that mates (positive = white mates). */
export const MATE_BASE = 10000;
/** Anything at or above this magnitude is a mate score. */
export const MATE_THRESHOLD = 9000;

/**
 * Encode a mate score.
 * @param n moves to mate; positive means the side named by `forWhite` delivers mate.
 */
export function encodeMate(n: number, forWhite: boolean): number {
  const v = MATE_BASE - Math.abs(n);
  return forWhite ? v : -v;
}

export function isMate(v: number): boolean {
  return Math.abs(v) >= MATE_THRESHOLD;
}

/** Moves to mate (always ≥ 0) for a mate-encoded value, or null if not a mate score. */
export function mateDistance(v: number): number | null {
  return isMate(v) ? MATE_BASE - Math.abs(v) : null;
}

/**
 * Convert a UCI score (always from the side to move) into white-perspective encoding.
 * `mate X`: X>0 side to move mates in X, X<0 side to move gets mated in |X|.
 */
export function uciScoreToWhite(kind: 'cp' | 'mate', value: number, whiteToMove: boolean): number {
  let stm: number;
  if (kind === 'cp') stm = value;
  else if (value > 0) stm = MATE_BASE - value;
  else stm = -(MATE_BASE - Math.abs(value)); // value 0 (already mated) → −10000
  return whiteToMove ? stm : -stm;
}

/** Win probability (0..100) for White given a white-perspective evaluation. */
export function winPercentWhite(evalWhite: number): number {
  const k = CONFIG.winK;
  return 50 + 50 * (2 / (1 + Math.exp(-k * evalWhite)) - 1);
}

/** Win probability (0..100) for the given colour. */
export function winPercentFor(evalWhite: number, white: boolean): number {
  const w = winPercentWhite(evalWhite);
  return white ? w : 100 - w;
}

/** Lichess per-move accuracy from a win% loss, clamped to 0..100. */
export function moveAccuracy(loss: number): number {
  const l = Math.max(0, loss);
  const a = 103.1668 * Math.exp(-0.04354 * l) - 3.1669;
  return Math.min(100, Math.max(0, a));
}

/** Average accuracy of a list of losses; null when the list is empty. */
export function averageAccuracy(losses: number[]): number | null {
  if (losses.length === 0) return null;
  const sum = losses.reduce((s, l) => s + moveAccuracy(l), 0);
  return Math.min(100, Math.max(0, sum / losses.length));
}

/** Human-readable evaluation from White's side: "+1.25", "−0.40", "#3", "#-2". */
export function formatEval(v: number): string {
  const m = mateDistance(v);
  if (m !== null) {
    if (m === 0) return v > 0 ? '1-0' : '0-1';
    return v > 0 ? `#${m}` : `#-${m}`;
  }
  const p = v / 100;
  const s = Math.abs(p).toFixed(2);
  if (Math.abs(p) < 0.005) return '0.00';
  return p > 0 ? `+${s}` : `−${s}`;
}
