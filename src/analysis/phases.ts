import { CONFIG } from './config';

export type Phase = 'opening' | 'middlegame' | 'endgame';
export const PHASES: readonly Phase[] = ['opening', 'middlegame', 'endgame'];

/** Queens, rooks, bishops and knights of both sides. */
export function majorsAndMinors(fen: string): number {
  let n = 0;
  for (const ch of fen.split(' ')[0]) if ('qrbnQRBN'.includes(ch)) n++;
  return n;
}

/** Pieces (not pawns) still standing on White's first rank and Black's eighth rank. */
function backRanks(fen: string): { w: number; b: number } {
  const rows = fen.split(' ')[0].split('/');
  const count = (row: string, white: boolean) =>
    [...row].filter((c) => /[a-z]/i.test(c) && c.toLowerCase() !== 'p' && (c === c.toUpperCase()) === white).length;
  return { w: count(rows[7], true), b: count(rows[0], false) };
}

/**
 * Split a game into phases by material and development (the idea of the lichess "divider"):
 * the middlegame starts once enough pieces have left the back ranks or been traded,
 * the endgame once few pieces remain. `fens[0]` is the start position.
 * Returns the phase of the position AFTER each ply (index = ply − 1).
 */
export function phaseOfPlies(fens: string[], lastBookPly: number): Phase[] {
  const p = CONFIG.phases;
  const out: Phase[] = [];
  let phase: Phase = 'opening';
  for (let i = 1; i < fens.length; i++) {
    const fen = fens[i];
    const mm = majorsAndMinors(fen);
    if (mm <= p.endgameMaxPieces) phase = 'endgame';
    else if (phase === 'opening' && i > lastBookPly) {
      const br = backRanks(fen);
      if (mm <= p.middlegameMaxPieces || br.w < p.backRankSparse || br.b < p.backRankSparse || i > p.openingMaxPly) {
        phase = 'middlegame';
      }
    }
    out.push(phase);
  }
  return out;
}
