/** One principal variation reported by the engine. */
export interface EngineLine {
  /** 1-based MultiPV index. */
  multipv: number;
  depth: number;
  /** Evaluation from WHITE's point of view, centipawns; mate encoded as ±(10000 − N). */
  eval: number;
  /** Moves in UCI notation (e2e4, e7e8q). */
  pv: string[];
}

/** Engine result for one position. */
export interface PositionEval {
  fen: string;
  depth: number;
  /** Sorted by multipv (best first). Empty for terminal positions. */
  lines: EngineLine[];
  /** Best move in UCI, or null for terminal positions. */
  bestMove: string | null;
  /** True when the position is checkmate / stalemate / dead draw and was scored without the engine. */
  terminal: boolean;
}

/** Anything that can analyse a FEN. The browser uses a Web Worker, tests use Node. */
export interface Engine {
  init(): Promise<void>;
  analyse(fen: string, depth: number, multiPv: number): Promise<PositionEval>;
  /** Stop the current search and drop any pending work. */
  cancel(): void;
  dispose(): void;
}
