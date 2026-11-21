import { describe, expect, it } from 'vitest';
import {
  chesscomRecent,
  formatTimeControl,
  ImportError,
  lichessRecent,
  parseLichessNdjson,
} from '../../src/importers/importers';

function fakeFetch(routes: Record<string, { status?: number; body: unknown }>): typeof fetch {
  return (async (url: string) => {
    const key = Object.keys(routes).find((k) => String(url).startsWith(k));
    if (!key) return new Response('nope', { status: 404 });
    const r = routes[key];
    const body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
    return new Response(body, { status: r.status ?? 200 });
  }) as typeof fetch;
}

const ccGame = (n: number, rules = 'chess') => ({
  url: `https://www.chess.com/game/live/${n}`,
  pgn: '[White "a"]\n[Black "b"]\n\n1. e4 e5 *',
  end_time: 1_700_000_000 + n,
  time_control: '180+2',
  time_class: 'blitz',
  rules,
  white: { username: 'a', rating: 1500, result: 'win' },
  black: { username: 'b', rating: 1490, result: 'checkmated' },
});

describe('chess.com import', () => {
  it('collects recent months newest first and skips variants', async () => {
    const f = fakeFetch({
      'https://api.chess.com/pub/player/hero/games/archives': {
        body: { archives: ['https://api.chess.com/pub/player/hero/games/2024/04', 'https://api.chess.com/pub/player/hero/games/2024/05'] },
      },
      'https://api.chess.com/pub/player/hero/games/2024/05': { body: { games: [ccGame(1), ccGame(2), ccGame(3, 'chess960')] } },
      'https://api.chess.com/pub/player/hero/games/2024/04': { body: { games: [ccGame(0)] } },
    });
    const r = await chesscomRecent('Hero', 20, 3, f);
    expect(r.games.map((g) => g.id.slice(-1))).toEqual(['2', '1', '0']);
    expect(r.games[0].result).toBe('1-0');
    expect(r.games[0].timeControl).toBe('3+2');
  });
  it('reports unknown users, empty archives and rate limits', async () => {
    await expect(chesscomRecent('ghost', 20, 3, fakeFetch({}))).rejects.toMatchObject({ code: 'not-found' });
    const empty = fakeFetch({ 'https://api.chess.com/pub/player/new/games/archives': { body: { archives: [] } } });
    await expect(chesscomRecent('new', 20, 3, empty)).rejects.toMatchObject({ code: 'empty' });
    const limited = fakeFetch({ 'https://api.chess.com': { status: 429, body: {} } });
    await expect(chesscomRecent('x1', 20, 3, limited)).rejects.toMatchObject({ code: 'rate-limit' });
    await expect(chesscomRecent('  ', 20, 3, limited)).rejects.toBeInstanceOf(ImportError);
  });
});

describe('Lichess import', () => {
  const nd = [
    JSON.stringify({
      id: 'abc',
      createdAt: 1,
      lastMoveAt: 2,
      speed: 'rapid',
      variant: 'standard',
      winner: 'black',
      clock: { initial: 600, increment: 5 },
      players: { white: { user: { name: 'A' }, rating: 1800 }, black: { user: { name: 'B' }, rating: 1850 } },
      pgn: '1. e4 e5 *',
    }),
    JSON.stringify({ id: 'z', createdAt: 1, variant: 'atomic', players: { white: {}, black: {} }, pgn: '1. e4 *' }),
  ].join('\n');
  it('parses ndjson', () => {
    const g = parseLichessNdjson(nd);
    expect(g).toHaveLength(1);
    expect(g[0]).toMatchObject({ white: 'A', black: 'B', result: '0-1', timeControl: '10+5' });
  });
  it('maps HTTP errors', async () => {
    await expect(lichessRecent('nobody', 20, fakeFetch({}))).rejects.toMatchObject({ code: 'not-found' });
    const ok = fakeFetch({ 'https://lichess.org/api/games/user/Ann': { body: nd } });
    expect(await lichessRecent('Ann', 20, ok)).toHaveLength(1);
    const none = fakeFetch({ 'https://lichess.org/api/games/user/Ann': { body: '' } });
    await expect(lichessRecent('Ann', 20, none)).rejects.toMatchObject({ code: 'empty' });
  });
  it('formats time controls', () => {
    expect(formatTimeControl('600')).toBe('10+0');
    expect(formatTimeControl('180+2')).toBe('3+2');
    expect(formatTimeControl('1/86400')).toBe('1 d');
    expect(formatTimeControl('90+30')).toBe('1.5+30');
  });
});
