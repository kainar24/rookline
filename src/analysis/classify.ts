import type { PositionEval } from '../engine/types';
import type { ParsedGame } from '../pgn/pgn';
import { CONFIG } from './config';
import { moveAccuracy, playerAccuracy, volatilityWeights, winPercentFor } from './evalMath';
import type { OpeningBook } from './openings';
import { PHASES, phaseOfPlies, type Phase } from './phases';
import { estimateGameRating } from './rating';
import { detectSacrifice, uciToSan } from './material';

export const CATEGORIES = [
  'brilliant',
  'great',
  'best',
  'excellent',
  'good',
  'book',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
] as const;
export type Category = (typeof CATEGORIES)[number];

export const BAD_CATEGORIES: ReadonlySet<Category> = new Set(['inaccuracy', 'mistake', 'miss', 'blunder']);

export interface MoveReview {
  ply: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  from: string;
  to: string;
  fenBefore: string;
  fenAfter: string;
  /** White-perspective evals (best line before, best line after). */
  evalBefore: number;
  evalAfter: number;
  /** Win% for the mover. */
  winBefore: number;
  winAfter: number;
  /** Win% points lost (≥ 0). */
  loss: number;
  /** Move accuracy 0..100 (chess.com-fitted curve, see CONFIG.accuracy). */
  accuracy: number;
  category: Category;
  isBest: boolean;
  bestMove: string | null;
  bestSan: string | null;
  /** Engine PV from the position before the move (UCI). */
  bestLine: string[];
  /** Engine PV from the position after the move (the opponent's best reply first). */
  replyLine: string[];
  /** Win% of the second line for the mover, when available. */
  secondWin: number | null;
  sacrifice: boolean;
  phase: Phase;
  /** Square where the opponent's previous move captured (null if it was not a capture). */
  recaptureSquare?: string | null;
}

export interface GameReview {
  moves: MoveReview[];
  accuracy: { w: number | null; b: number | null };
  counts: { w: Record<Category, number>; b: Record<Category, number> };
  /** Win% for White after each position (index = ply, 0 = start). */
  whiteWin: number[];
  evals: number[];
  /** Approximate rating for each side in this game (null when a side made no moves). */
  gameRating: { w: number | null; b: number | null };
  /** Accuracy per phase and side; null when the phase did not happen or the side made no move in it. */
  phases: Record<Phase, { w: number | null; b: number | null }>;
  /** Deepest named opening reached, e.g. "C20 King's Pawn Game". */
  opening: string | null;
}

export interface ReviewOptions {
  /** Opening book; without it "Book" falls back to the early-ply rule. */
  book?: OpeningBook;
}

/** Category from loss alone (the "base" ladder). */
export function baseCategory(loss: number, isBest: boolean): Category {
  if (isBest) return 'best';
  const t = CONFIG.loss;
  if (loss <= t.excellent) return 'excellent';
  if (loss <= t.good) return 'good';
  if (loss <= t.inaccuracy) return 'inaccuracy';
  if (loss <= t.mistake) return 'mistake';
  return 'blunder';
}

export interface ClassifyInput {
  ply: number;
  loss: number;
  isBest: boolean;
  bookStreak: boolean;
  winBefore: number;
  winAfter: number;
  /** Win% gap between line 1 and line 2 for the mover (null if only one legal move). */
  gap: number | null;
  sacrifice: boolean;
  previousCategory: Category | null;
  /** Captures on the square where the opponent's last move landed. */
  isRecapture?: boolean;
  /** The move delivers checkmate. */
  givesMate?: boolean;
  /** Decided by the opening book when one is loaded (overrides the ply rule). */
  inBook?: boolean;
}

/** Pure decision ladder with special labels. Order matters: book → brilliant → great → base → miss. */
export function classifyMove(i: ClassifyInput): Category {
  if (i.inBook !== undefined) {
    if (i.inBook) return 'book';
  } else if (i.bookStreak && i.ply <= CONFIG.book.maxPly && i.loss <= CONFIG.book.maxLoss) return 'book';
  const b = CONFIG.brilliant;
  if (i.sacrifice && i.loss <= b.maxLoss && i.winAfter >= b.minWinAfter && i.winBefore < b.maxWinBefore) {
    return 'brilliant';
  }
  const g = CONFIG.great;
  if (
    i.isBest &&
    i.gap !== null &&
    i.gap >= g.minGap &&
    !(g.excludeRecapture && i.isRecapture) &&
    !(g.excludeMate && i.givesMate)
  ) {
    return 'great';
  }
  // Any checkmate is as good as the engine's move, even if the engine preferred another mate.
  if (i.givesMate) return 'best';
  const base = baseCategory(i.loss, i.isBest);
  const m = CONFIG.miss;
  if (
    i.previousCategory !== null &&
    (m.previousCategories as readonly string[]).includes(i.previousCategory) &&
    i.loss >= m.minLoss &&
    i.winBefore >= m.minBestWin &&
    i.winAfter >= m.minWinAfter
  ) {
    return 'miss';
  }
  return base;
}

function emptyCounts(): Record<Category, number> {
  return Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
}

/** Build the full review from parsed game + one PositionEval per FEN. */
export function reviewGame(game: ParsedGame, evals: PositionEval[], opts: ReviewOptions = {}): GameReview {
  if (evals.length !== game.fens.length) throw new Error('evals do not match positions');
  const moves: MoveReview[] = [];
  let bookStreak = true;
  let prev: Category | null = null;
  let prevCaptureTo: string | null = null;
  let prevTo: string | null = null;
  let opening: string | null = null;
  let lastBookPly = 0;
  const book = opts.book;
  for (const p of game.plies) {
    const before = evals[p.ply - 1];
    const after = evals[p.ply];
    const white = p.color === 'w';
    const evalBefore = before.lines[0]?.eval ?? 0;
    const evalAfter = after.lines[0]?.eval ?? 0;
    const winBefore = winPercentFor(evalBefore, white);
    const winAfter = winPercentFor(evalAfter, white);
    const bestMove = before.bestMove ?? before.lines[0]?.pv[0] ?? null;
    const isBest = bestMove !== null && bestMove === p.uci;
    const loss = isBest ? 0 : Math.max(0, winBefore - winAfter);
    const second = before.lines[1];
    const secondWin = second ? winPercentFor(second.eval, white) : null;
    const gap = secondWin === null ? null : winBefore - secondWin;
    const sac = detectSacrifice(p.fenAfter, p.to, p.captured);
    let inBook: boolean | undefined;
    if (book) {
      inBook =
        bookStreak &&
        (book.has(p.fenAfter) || (p.ply <= CONFIG.book.fallbackMaxPly && loss <= CONFIG.book.maxLoss));
      const name = book.name(p.fenAfter);
      if (name && (inBook || opening === null)) opening = name;
    }
    const category = classifyMove({
      ply: p.ply,
      loss,
      isBest,
      bookStreak,
      winBefore,
      winAfter,
      gap,
      sacrifice: sac !== null,
      previousCategory: prev,
      // Taking the piece that just moved (or took) is too obvious to be "Great".
      isRecapture: !!p.captured && p.to === prevTo,
      givesMate: p.san.endsWith('#'),
      inBook,
    });
    if (category !== 'book') bookStreak = false;
    else lastBookPly = p.ply;
    prev = category;
    const opponentCaptureTo = prevCaptureTo;
    prevCaptureTo = p.captured ? p.to : null;
    prevTo = p.to;
    moves.push({
      ply: p.ply,
      moveNumber: p.moveNumber,
      color: p.color,
      san: p.san,
      uci: p.uci,
      from: p.from,
      to: p.to,
      fenBefore: p.fenBefore,
      fenAfter: p.fenAfter,
      evalBefore,
      evalAfter,
      winBefore,
      winAfter,
      loss,
      accuracy: moveAccuracy(
        isBest
          ? 0
          : Math.max(
              0,
              winPercentFor(evalBefore, white, CONFIG.accuracy.winK) - winPercentFor(evalAfter, white, CONFIG.accuracy.winK),
            ),
      ),
      category,
      isBest,
      bestMove,
      bestSan: bestMove ? uciToSan(p.fenBefore, bestMove) : null,
      bestLine: before.lines[0]?.pv ?? [],
      replyLine: after.lines[0]?.pv ?? [],
      secondWin,
      sacrifice: sac !== null,
      phase: 'opening',
      recaptureSquare: opponentCaptureTo,
    });
  }
  const counts = { w: emptyCounts(), b: emptyCounts() };
  for (const m of moves) counts[m.color][m.category]++;
  const evalList = evals.map((e) => e.lines[0]?.eval ?? 0);
  const whiteWin = evalList.map((e) => winPercentFor(e, true));

  const weights = volatilityWeights(whiteWin);
  const phaseList = phaseOfPlies(game.fens, lastBookPly);
  moves.forEach((m, i) => (m.phase = phaseList[i]));
  const accuracyOf = (pick: (m: MoveReview) => boolean) => {
    const sel = moves.map((m, i) => ({ m, w: weights[i] })).filter(({ m }) => pick(m));
    return playerAccuracy(
      sel.map(({ m }) => m.accuracy),
      sel.map(({ w }) => w),
    );
  };
  const accuracy = {
    w: accuracyOf((m) => m.color === 'w'),
    b: accuracyOf((m) => m.color === 'b'),
  };
  const phases = Object.fromEntries(
    PHASES.map((ph) => [
      ph,
      { w: accuracyOf((m) => m.color === 'w' && m.phase === ph), b: accuracyOf((m) => m.color === 'b' && m.phase === ph) },
    ]),
  ) as GameReview['phases'];
  const elo = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  return {
    moves,
    accuracy,
    counts,
    evals: evalList,
    whiteWin,
    gameRating: {
      w: estimateGameRating(accuracy.w, elo(game.headers.whiteElo)),
      b: estimateGameRating(accuracy.b, elo(game.headers.blackElo)),
    },
    phases,
    opening,
  };
}
