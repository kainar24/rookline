import { describe, expect, it } from 'vitest';
import { parseGame, splitPgn, summariseGames, hashGame, PgnError } from '../../src/pgn/pgn';
import { TWO_GAMES, BROKEN } from '../fixtures/games';

describe('PGN parsing', () => {
  it('splits a file with several games', () => {
    const parts = splitPgn(TWO_GAMES);
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain('Qxf7#');
    expect(parts[1]).toContain('Qh4#');
  });

  it('parses headers, plies and FENs', () => {
    const g = parseGame(splitPgn(TWO_GAMES)[1]);
    expect(g.headers.white).toBe('Bob');
    expect(g.headers.black).toBe('Alice');
    expect(g.headers.result).toBe('0-1');
    expect(g.plies.map((p) => p.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#']);
    expect(g.plies[3].uci).toBe('d8h4');
    expect(g.fens).toHaveLength(5);
    expect(g.fens[0]).toBe('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(g.plies[1].moveNumber).toBe(1);
    expect(g.plies[2].moveNumber).toBe(2);
  });

  it('summarises every game and flags broken ones', () => {
    const s = summariseGames(TWO_GAMES + '\n\n' + BROKEN);
    expect(s).toHaveLength(3);
    expect(s[0].plyCount).toBe(7);
    expect(s[2].error).toBeTruthy();
    expect(s[2].headers.white).toBe('X');
  });

  it('rejects empty and broken PGN with a typed error', () => {
    expect(() => parseGame('   ')).toThrow(PgnError);
    expect(() => parseGame(BROKEN)).toThrow(PgnError);
  });

  it('handles Windows line endings and a BOM', () => {
    const g = parseGame('﻿' + splitPgn(TWO_GAMES)[0].replace(/\n/g, '\r\n'));
    expect(g.plies).toHaveLength(7);
  });

  it('hashes the move sequence, ignoring headers', async () => {
    const a = parseGame(splitPgn(TWO_GAMES)[0]);
    const b = parseGame(splitPgn(TWO_GAMES)[0].replace('Alice', 'Carol'));
    expect(await hashGame(a)).toBe(await hashGame(b));
  });
});
