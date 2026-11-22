import { Chess } from 'chess.js';

export interface GameHeaders {
  white: string;
  black: string;
  whiteElo?: string;
  blackElo?: string;
  result: string;
  date?: string;
  timeControl?: string;
  event?: string;
  site?: string;
  [k: string]: string | undefined;
}

/** One played half-move with everything the analyser needs. */
export interface PlyInfo {
  /** 1-based ply index. */
  ply: number;
  /** 1-based full move number. */
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  from: string;
  to: string;
  piece: string;
  captured?: string;
  promotion?: string;
  fenBefore: string;
  fenAfter: string;
}

export interface ParsedGame {
  headers: GameHeaders;
  /** FEN before ply 1 (start position or the game's SetUp FEN). */
  startFen: string;
  plies: PlyInfo[];
  /** FEN before each move plus the final position: length = plies.length + 1. */
  fens: string[];
  /** Seconds left on the mover's clock after each ply ([%clk] comments), when the PGN has them. */
  clocks?: number[];
  /** Starting time in seconds (from TimeControl), when known. */
  baseClock?: number;
  pgn: string;
}

export class PgnError extends Error {
  constructor(
    public code: 'empty' | 'invalid' | 'no-moves',
    message: string,
  ) {
    super(message);
  }
}

/**
 * Split a PGN file with several games into one string per game.
 * A new game starts at a tag line that follows movetext.
 */
export function splitPgn(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n');
  const games: string[] = [];
  let cur: string[] = [];
  let seenMoves = false;
  const flush = () => {
    const g = cur.join('\n').trim();
    if (g) games.push(g);
    cur = [];
    seenMoves = false;
  };
  for (const line of lines) {
    const t = line.trim();
    const isTag = /^\[\w+\s+".*"\]$/.test(t);
    if (isTag && seenMoves) flush();
    if (!isTag && t && !t.startsWith('%')) seenMoves = true;
    cur.push(line);
  }
  flush();
  return games;
}

function readHeaders(chess: Chess): GameHeaders {
  const h = chess.getHeaders();
  const out: GameHeaders = {
    white: h.White || '?',
    black: h.Black || '?',
    result: h.Result || '*',
  };
  if (h.WhiteElo) out.whiteElo = h.WhiteElo;
  if (h.BlackElo) out.blackElo = h.BlackElo;
  const date = h.UTCDate || h.Date;
  if (date && !date.includes('?')) out.date = date;
  if (h.TimeControl && h.TimeControl !== '-') out.timeControl = h.TimeControl;
  if (h.Event) out.event = h.Event;
  if (h.Site) out.site = h.Site;
  for (const [k, v] of Object.entries(h)) if (!(k in out) && v) out[k] = v;
  return out;
}

/** Strip things chess.js may choke on but a review does not need (clock comments stay harmless). */
function normalise(pgn: string): string {
  return pgn
    .replace(/\r\n?/g, '\n')
    .replace(/^﻿/, '')
    .trim();
}

/** Parse a single PGN game into plies and FENs. Throws PgnError. */
export function parseGame(pgnText: string): ParsedGame {
  const pgn = normalise(pgnText);
  if (!pgn) throw new PgnError('empty', 'empty PGN');
  const chess = new Chess();
  try {
    chess.loadPgn(pgn);
  } catch (e) {
    // chess.js parser messages list every expected token; keep only the useful tail.
    const raw = (e as Error).message;
    const found = raw.match(/but (.+) found/);
    throw new PgnError('invalid', found ? `unexpected ${found[1]}` : raw.slice(0, 140));
  }
  const history = chess.history({ verbose: true });
  if (history.length === 0) throw new PgnError('no-moves', 'no moves in PGN');
  const headers = readHeaders(chess);
  const plies: PlyInfo[] = history.map((m, i) => {
    const moveNumber = Number(m.before.split(' ')[5]) || Math.floor(i / 2) + 1;
    return {
      ply: i + 1,
      moveNumber,
      color: m.color,
      san: m.san,
      uci: m.from + m.to + (m.promotion ?? ''),
      from: m.from,
      to: m.to,
      piece: m.piece,
      captured: m.captured,
      promotion: m.promotion,
      fenBefore: m.before,
      fenAfter: m.after,
    };
  });
  const fens = [plies[0].fenBefore, ...plies.map((p) => p.fenAfter)];
  const clocks = readClocks(pgn, plies.length);
  const base = Number(headers.timeControl?.split('+')[0]);
  return { headers, startFen: fens[0], plies, fens, pgn, clocks, baseClock: base > 0 ? base : undefined };
}

/** One [%clk h:mm:ss] per move, in order; anything else (missing or extra clocks) means "no clocks". */
export function readClocks(pgn: string, plies: number): number[] | undefined {
  const moves = pgn.replace(/^\s*\[[^\]]*\]\s*$/gm, '');
  const out: number[] = [];
  for (const m of moves.matchAll(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/g)) {
    out.push(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
  }
  return out.length === plies ? out : undefined;
}

/** Lightweight summary of every game in a multi-game file (for a picker). */
export interface GameSummary {
  index: number;
  headers: GameHeaders;
  plyCount: number;
  error?: string;
  pgn: string;
}

export function summariseGames(text: string): GameSummary[] {
  return splitPgn(text).map((pgn, index) => {
    try {
      const g = parseGame(pgn);
      return { index, headers: g.headers, plyCount: g.plies.length, pgn };
    } catch (e) {
      // Headers may still be readable when the movetext is broken.
      const h: Record<string, string> = {};
      for (const t of pgn.matchAll(/^\[(\w+)\s+"(.*)"\]$/gm)) h[t[1]] = t[2];
      const headers: GameHeaders = { white: h.White || '?', black: h.Black || '?', result: h.Result || '*', date: h.Date };
      return { index, headers, plyCount: 0, error: (e as Error).message, pgn };
    }
  });
}

/** Stable SHA-256 hex of the move sequence (headers/comments do not matter for analysis). */
export async function hashGame(game: ParsedGame): Promise<string> {
  const key = game.startFen + '|' + game.plies.map((p) => p.uci).join(' ');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
