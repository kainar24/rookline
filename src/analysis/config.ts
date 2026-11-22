/**
 * Every tunable number of the review model lives here.
 * Tweak thresholds in one place; tests import the same object.
 */
export const CONFIG = {
  /** Logistic coefficient for cp → win%. */
  winK: 0.00368208,

  /** Default and allowed search depth. */
  depth: { default: 16, min: 8, max: 22 },
  multiPv: 2,

  /** Base categories by win% loss (percentage points, inclusive upper bounds). */
  loss: {
    excellent: 2,
    good: 5,
    inaccuracy: 10,
    mistake: 20,
    // > mistake → blunder
  },

  book: {
    /**
     * With the opening book loaded, a move is "Book" when the position after it is in the book.
     * Without a book (unit tests) or past its end, a move can still be "Book" while ply ≤ maxPly …
     */
    maxPly: 10,
    /** … and its loss stays at or below this. The streak ends at the first non-book move. */
    maxLoss: 2,
    /** With the book loaded, the fallback above only applies up to this ply. */
    fallbackMaxPly: 2,
  },

  /**
   * Game accuracy, fitted to chess.com's published accuracies: 110 public games (220 players,
   * ratings 200–3300) analysed at depth 16 with the same Stockfish lite build. Mean absolute
   * error vs chess.com: 3.9 points (lichess formula: 8.0, plain average used before: 16.5).
   * Per move: a·exp(−b·loss) − c, with loss measured on a flatter win% curve (winK).
   * Per player: harmonic mean of move accuracies (each floored at harmonicFloor), optionally
   * blended with a volatility-weighted mean (weightedShare; the fit preferred 0).
   */
  accuracy: {
    winK: 0.002,
    a: 103.1669,
    b: 0.09,
    c: 3.1669,
    weightedShare: 0,
    harmonicFloor: 23,
    /** Weights = std-dev of win% in a sliding window, clamped to [minWeight, maxWeight]. */
    minWeight: 0.5,
    maxWeight: 12,
  },

  /**
   * Approximate game rating. chess.com's accuracies grow roughly with ln(rating):
   * expected accuracy ≈ slope·ln(R) + offset (least squares on the same 220 players). A game played above the
   * expected accuracy for the player's rating moves the estimate up, scaled by `shrink`
   * because one game is a noisy sample.
   */
  rating: {
    slope: 11.5,
    offset: -7.46,
    shrink: 0.6,
    min: 100,
    max: 3200,
    /** Without Elo headers the estimate is the rating whose expected accuracy matches. */
  },

  phases: {
    /** Endgame once this many queens/rooks/bishops/knights or fewer are left (both sides). */
    endgameMaxPieces: 6,
    /** Middlegame once this many or fewer are left … */
    middlegameMaxPieces: 10,
    /** … or either side has fewer than this many pieces on its back rank … */
    backRankSparse: 4,
    /** … or this many plies have been played. */
    openingMaxPly: 30,
    /** Phase accuracy → icon (lowest bound for each). */
    icon: { best: 95, excellent: 85, good: 72, inaccuracy: 58, mistake: 42 },
  },

  great: {
    /** Best move AND the gap between line 1 and line 2 (win% for the mover) is at least this. */
    minGap: 10,
    /** Taking back a piece on the square the opponent just captured on is too obvious to be "Great". */
    excludeRecapture: true,
    /** Delivering mate is labelled Best, not Great. */
    excludeMate: true,
  },

  brilliant: {
    maxLoss: 2,
    /** The moved piece must be worth at least this (N/B = 3). */
    minPieceValue: 3,
    /** Net material the mover can lose to the capture (in pawns, negative = loses material). */
    maxNetMaterial: -2,
    /** After the move the mover must still have at least this win%. */
    minWinAfter: 45,
    /** Before the move the mover must NOT already be at or above this win%. */
    maxWinBefore: 80,
  },

  miss: {
    /** The opponent's previous move had at least this category weight (mistake/blunder). */
    previousCategories: ['mistake', 'blunder'] as const,
    /** Current move loses at least this much … */
    minLoss: 10,
    /** … while the best move would have kept at least this win% for the mover. */
    minBestWin: 70,
    /** … and the mover is still not losing after the move (otherwise it stays Blunder/Mistake). */
    minWinAfter: 40,
  },

  /** Comment heuristics. */
  comments: {
    /** Material difference (pawns) that counts as "losing material" vs the best line. */
    materialLoss: 1,
    /**
     * A PV can end with a capture still pending, so the material count is capped by the
     * engine's own evaluation drop (centipawns per pawn) and needs at least this drop.
     */
    cpPerPawn: 100,
    minMaterialDropCp: 80,
    /** "Piece left hanging" needs a drop of at least this many centipawns. */
    hangingMinDropCp: 200,
    /** How many plies of a PV are replayed to measure material. */
    pvPlies: 6,
  },

  pieceValue: { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 } as Record<string, number>,
} as const;

export type Config = typeof CONFIG;
