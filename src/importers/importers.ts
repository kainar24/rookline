/** Fetch recent games by username from chess.com and Lichess public APIs (both allow CORS). */

export interface RemoteGame {
  id: string;
  source: 'chesscom' | 'lichess';
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  /** "1-0", "0-1", "½-½" */
  result: string;
  /** ms since epoch */
  endTime: number;
  timeControl: string;
  /** e.g. blitz / rapid / bullet / daily / classical */
  speed?: string;
  pgn: string;
}

export type ImportErrorCode = 'no-user' | 'not-found' | 'empty' | 'rate-limit' | 'network';

export class ImportError extends Error {
  constructor(
    public code: ImportErrorCode,
    message: string = code,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

async function getJson(url: string, f: Fetch, init?: RequestInit): Promise<unknown> {
  let res: Response;
  try {
    res = await f(url, init);
  } catch (e) {
    throw new ImportError('network', (e as Error).message);
  }
  if (res.status === 404) throw new ImportError('not-found');
  if (res.status === 429) throw new ImportError('rate-limit');
  if (!res.ok) throw new ImportError('network', `HTTP ${res.status}`);
  return res.json();
}

function cleanUser(user: string): string {
  const u = user.trim();
  if (!u) throw new ImportError('no-user');
  if (!/^[\w-]{2,30}$/.test(u)) throw new ImportError('not-found');
  return u;
}

/** Format a chess.com / lichess clock like "600+5" → "10+5", "180" → "3+0", daily "1/86400" → "1 d". */
export function formatTimeControl(tc: string | undefined): string {
  if (!tc || tc === '-') return '—';
  const daily = tc.match(/^1\/(\d+)$/);
  if (daily) return `${Math.round(Number(daily[1]) / 86400)} d`;
  const m = tc.match(/^(\d+)(?:\+(\d+))?$/);
  if (!m) return tc;
  const base = Number(m[1]);
  const inc = Number(m[2] ?? 0);
  const baseStr = base % 60 === 0 ? String(base / 60) : (base / 60).toFixed(1).replace(/\.0$/, '');
  return `${baseStr}+${inc}`;
}

// ---------------- chess.com ----------------

interface ChesscomPlayer {
  username: string;
  rating?: number;
  result: string;
}
interface ChesscomGame {
  url: string;
  pgn?: string;
  end_time: number;
  time_control: string;
  time_class?: string;
  rules?: string;
  white: ChesscomPlayer;
  black: ChesscomPlayer;
}

function chesscomResult(g: ChesscomGame): string {
  if (g.white.result === 'win') return '1-0';
  if (g.black.result === 'win') return '0-1';
  return '½-½';
}

/** Archive URLs (one per month), oldest first. */
export async function chesscomArchives(user: string, f: Fetch = fetch): Promise<string[]> {
  const u = cleanUser(user).toLowerCase();
  const data = (await getJson(`https://api.chess.com/pub/player/${encodeURIComponent(u)}/games/archives`, f)) as {
    archives?: string[];
  };
  const list = data.archives ?? [];
  if (list.length === 0) throw new ImportError('empty');
  return list;
}

/** Standard-chess games of one monthly archive, newest first. */
export async function chesscomMonth(archiveUrl: string, f: Fetch = fetch): Promise<RemoteGame[]> {
  const data = (await getJson(archiveUrl, f)) as { games?: ChesscomGame[] };
  return (data.games ?? [])
    .filter((g) => g.pgn && (g.rules ?? 'chess') === 'chess')
    .map((g) => ({
      id: g.url,
      source: 'chesscom' as const,
      white: g.white.username,
      black: g.black.username,
      whiteElo: g.white.rating,
      blackElo: g.black.rating,
      result: chesscomResult(g),
      endTime: g.end_time * 1000,
      timeControl: formatTimeControl(g.time_control),
      speed: g.time_class,
      pgn: g.pgn!,
    }))
    .sort((a, b) => b.endTime - a.endTime);
}

/**
 * Load the most recent months until at least `minGames` games are collected (max `maxMonths`).
 * Returns games plus the archive list and how many months were consumed (for "load more").
 */
export async function chesscomRecent(
  user: string,
  minGames = 20,
  maxMonths = 3,
  f: Fetch = fetch,
): Promise<{ games: RemoteGame[]; archives: string[]; used: number }> {
  const archives = await chesscomArchives(user, f);
  const games: RemoteGame[] = [];
  let used = 0;
  for (let i = archives.length - 1; i >= 0 && used < maxMonths; i--) {
    games.push(...(await chesscomMonth(archives[i], f)));
    used++;
    if (games.length >= minGames) break;
  }
  if (games.length === 0 && used >= archives.length) throw new ImportError('empty');
  return { games, archives, used };
}

// ---------------- Lichess ----------------

interface LichessGame {
  id: string;
  createdAt: number;
  lastMoveAt?: number;
  speed?: string;
  variant?: string;
  status?: string;
  winner?: 'white' | 'black';
  clock?: { initial: number; increment: number };
  players: {
    white: { user?: { name: string }; rating?: number; aiLevel?: number };
    black: { user?: { name: string }; rating?: number; aiLevel?: number };
  };
  pgn?: string;
}

function lichessName(p: LichessGame['players']['white']): string {
  return p.user?.name ?? (p.aiLevel ? `Stockfish lvl ${p.aiLevel}` : '?');
}

export function parseLichessNdjson(text: string): RemoteGame[] {
  const out: RemoteGame[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let g: LichessGame;
    try {
      g = JSON.parse(line);
    } catch {
      continue;
    }
    if (!g.pgn || (g.variant && g.variant !== 'standard')) continue;
    out.push({
      id: g.id,
      source: 'lichess',
      white: lichessName(g.players.white),
      black: lichessName(g.players.black),
      whiteElo: g.players.white.rating,
      blackElo: g.players.black.rating,
      result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '½-½',
      endTime: g.lastMoveAt ?? g.createdAt,
      timeControl: g.clock ? `${g.clock.initial / 60}+${g.clock.increment}` : (g.speed ?? '—'),
      speed: g.speed,
      pgn: g.pgn,
    });
  }
  return out;
}

export async function lichessRecent(user: string, max = 20, f: Fetch = fetch): Promise<RemoteGame[]> {
  const u = cleanUser(user);
  let res: Response;
  try {
    res = await f(`https://lichess.org/api/games/user/${encodeURIComponent(u)}?max=${max}&pgnInJson=true&clocks=false&evals=false`, {
      headers: { Accept: 'application/x-ndjson' },
    });
  } catch (e) {
    throw new ImportError('network', (e as Error).message);
  }
  if (res.status === 404) throw new ImportError('not-found');
  if (res.status === 429) throw new ImportError('rate-limit');
  if (!res.ok) throw new ImportError('network', `HTTP ${res.status}`);
  const games = parseLichessNdjson(await res.text());
  if (games.length === 0) throw new ImportError('empty');
  return games;
}
