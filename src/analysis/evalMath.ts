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
export function winPercentWhite(evalWhite: number, k: number = CONFIG.winK): number {
  return 50 + 50 * (2 / (1 + Math.exp(-k * evalWhite)) - 1);
}

/** Win probability (0..100) for the given colour. */
export function winPercentFor(evalWhite: number, white: boolean, k: number = CONFIG.winK): number {
  const w = winPercentWhite(evalWhite, k);
  return white ? w : 100 - w;
}

/** Per-move accuracy from a win% loss (lichess shape, constants in CONFIG.accuracy), 0..100. */
export function moveAccuracy(loss: number): number {
  const { a, b, c } = CONFIG.accuracy;
  const l = Math.max(0, loss);
  return Math.min(100, Math.max(0, a * Math.exp(-b * l) - c));
}

/** Plain average of per-move accuracies for a list of losses; null when the list is empty. */
export function averageAccuracy(losses: number[]): number | null {
  if (losses.length === 0) return null;
  const sum = losses.reduce((s, l) => s + moveAccuracy(l), 0);
  return Math.min(100, Math.max(0, sum / losses.length));
}

function stdDev(xs: number[]): number {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

/**
 * Weight of each move (index = ply − 1): how much the win% swings around it.
 * Quiet positions count less, sharp ones more — one blunder in a tense spot weighs a lot.
 */
export function volatilityWeights(whiteWin: number[]): number[] {
  const { minWeight, maxWeight } = CONFIG.accuracy;
  const n = whiteWin.length;
  const size = Math.min(8, Math.max(2, Math.ceil(n / 10)));
  const half = Math.round(size / 2);
  const out: number[] = [];
  for (let i = 1; i < n; i++) {
    let win: number[];
    if (i - half < 0) win = whiteWin.slice(0, size);
    else if (i + half > n) win = whiteWin.slice(-size);
    else win = whiteWin.slice(i - half, i + half);
    out.push(Math.min(maxWeight, Math.max(minWeight, stdDev(win))));
  }
  return out;
}

/**
 * Accuracy of one player's moves: a mix of the volatility-weighted mean and the harmonic mean
 * of per-move accuracies (the harmonic mean punishes a few very bad moves).
 */
export function playerAccuracy(accuracies: number[], weights: number[]): number | null {
  if (accuracies.length === 0) return null;
  const { weightedShare, harmonicFloor } = CONFIG.accuracy;
  const wSum = weights.reduce((s, w) => s + w, 0);
  const weighted = accuracies.reduce((s, a, i) => s + a * weights[i], 0) / wSum;
  const harmonic = accuracies.length / accuracies.reduce((s, a) => s + 1 / Math.max(a, harmonicFloor), 0);
  const v = weightedShare * weighted + (1 - weightedShare) * harmonic;
  return Math.min(100, Math.max(0, v));
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
