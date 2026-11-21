import { uciScoreToWhite } from '../analysis/evalMath';
import type { EngineLine } from './types';

export interface ParsedInfo {
  depth: number;
  multipv: number;
  kind: 'cp' | 'mate';
  value: number;
  pv: string[];
  /** lowerbound / upperbound lines are not final and are ignored by the collector. */
  bound: boolean;
}

/** Parse a UCI `info` line. Returns null for lines without score+pv (e.g. `info string`, `currmove`). */
export function parseInfo(line: string): ParsedInfo | null {
  if (!line.startsWith('info ')) return null;
  const t = line.trim().split(/\s+/);
  let depth = -1;
  let multipv = 1;
  let kind: 'cp' | 'mate' | null = null;
  let value = 0;
  let bound = false;
  let pv: string[] | null = null;
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'string':
        return null;
      case 'depth':
        depth = Number(t[++i]);
        break;
      case 'multipv':
        multipv = Number(t[++i]);
        break;
      case 'score':
        kind = t[++i] as 'cp' | 'mate';
        value = Number(t[++i]);
        if (t[i + 1] === 'lowerbound' || t[i + 1] === 'upperbound') {
          bound = true;
          i++;
        }
        break;
      case 'pv':
        pv = t.slice(i + 1);
        i = t.length;
        break;
    }
  }
  if (depth < 0 || kind === null || pv === null || pv.length === 0) return null;
  if (kind !== 'cp' && kind !== 'mate') return null;
  return { depth, multipv, kind, value, pv, bound };
}

/** Parse `bestmove e2e4 ponder e7e5`. Returns the move or null (`bestmove (none)`). */
export function parseBestMove(line: string): string | null | undefined {
  if (!line.startsWith('bestmove')) return undefined;
  const m = line.trim().split(/\s+/)[1];
  if (!m || m === '(none)') return null;
  return m;
}

/**
 * Collects info lines for one search and keeps, per multipv, the deepest exact line.
 */
export class InfoCollector {
  private best = new Map<number, EngineLine>();
  constructor(private whiteToMove: boolean) {}

  push(line: string): void {
    const info = parseInfo(line);
    if (!info || info.bound) return;
    const prev = this.best.get(info.multipv);
    if (prev && prev.depth > info.depth) return;
    this.best.set(info.multipv, {
      multipv: info.multipv,
      depth: info.depth,
      eval: uciScoreToWhite(info.kind, info.value, this.whiteToMove),
      pv: info.pv,
    });
  }

  lines(): EngineLine[] {
    return [...this.best.values()].sort((a, b) => a.multipv - b.multipv);
  }
}
