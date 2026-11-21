import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { cacheKey, loadCached, saveCached } from '../../src/cache/idbCache';

describe('IndexedDB cache', () => {
  it('stores and reads evaluations by game hash and depth', async () => {
    const evals = [{ fen: 'x', depth: 12, lines: [], bestMove: null, terminal: true }];
    await saveCached(cacheKey('abc', 12), evals);
    expect(await loadCached(cacheKey('abc', 12))).toEqual(evals);
    expect(await loadCached(cacheKey('abc', 14))).toBeNull();
  });
});
