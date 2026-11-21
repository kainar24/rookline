/**
 * Every tunable number of the review model lives here.
 * Tweak thresholds in one place; tests import the same object.
 */
export const CONFIG = {
  /** Logistic coefficient for cp → win%. */
  winK: 0.00368208,

  /** Default and allowed search depth. */
  depth: { default: 13, min: 8, max: 20 },
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
    /** A move can be "Book" only while ply ≤ maxPly … */
    maxPly: 10,
    /** … and its loss stays at or below this. The streak ends at the first non-book move. */
    maxLoss: 2,
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
