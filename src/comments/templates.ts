import type { MoveReview } from '../analysis/classify';
import { fill, getLang, tList, t, type Key, type Lang } from '../i18n/i18n';
import { describeMove, type Idea } from './ideas';
import { findReason, type Reason } from './reasons';

/** Deterministic variant choice so the same move always reads the same, while neighbours differ. */
function pick(list: string[], seed: number): string {
  return list[Math.abs(seed) % list.length];
}

function pieceWords(piece: string, lang: Lang) {
  const acc = t(`piece_${piece}` as Key, undefined, lang);
  const nom = t(`pieceNom_${piece}` as Key, undefined, lang);
  const gen = t(`pieceGen_${piece}` as Key, undefined, lang);
  return { piece: acc, pieceNom: nom, PieceNom: nom.charAt(0).toUpperCase() + nom.slice(1), pieceGen: gen };
}

function reasonText(r: Reason, m: MoveReview, lang: Lang, seed: number): string {
  const p = { best: m.bestSan ?? '', played: m.san };
  switch (r.kind) {
    case 'allowsMate':
      return r.n <= 1
        ? pick(tList('r_allowsMate1', lang), seed)
        : fill(pick(tList('r_allowsMate', lang), seed), { ...p, n: r.n });
    case 'missedMate':
      return fill(pick(tList('r_missedMate', lang), seed), { ...p, n: r.n });
    case 'hangsMoved':
      return fill(pick(tList('r_hangsMoved', lang), seed), {
        ...p,
        ...pieceWords(r.piece, lang),
        square: r.square,
        reply: r.reply,
      });
    case 'hangsOther':
      return fill(pick(tList('r_hangsOther', lang), seed), {
        ...p,
        ...pieceWords(r.piece, lang),
        square: r.square,
        reply: r.reply,
      });
    case 'losesMaterial':
      return fill(pick(tList('r_losesMaterial', lang), seed), {
        ...p,
        pawns: r.pawns,
        pawnWord: lang === 'en' ? (r.pawns === 1 ? 'pawn' : 'pawns') : '',
      });
    case 'missedCapture':
      return fill(pick(tList('r_missedCapture', lang), seed), p);
    case 'missedCheck':
      return fill(pick(tList('r_missedCheck', lang), seed), p);
    case 'positional':
      return fill(pick(tList('r_positional', lang), seed), p);
    default:
      return '';
  }
}

/** Sentence for a board idea ("Develops the knight to f3."), or '' when there is nothing to say. */
export function ideaText(idea: Idea, lang: Lang, seed: number): string {
  if (idea.kind === 'none') return '';
  const key = (idea.kind === 'castle' ? `idea_castle_${idea.side}` : `idea_${idea.kind}`) as Key;
  const params: Record<string, string | number> = {};
  if ('piece' in idea) Object.assign(params, pieceWords(idea.piece, lang));
  if ('square' in idea) params.square = idea.square;
  if ('file' in idea) params.file = idea.file;
  if ('captured' in idea) {
    params.captured = t(`piece_${idea.captured}` as Key, undefined, lang);
    params.capturedNom = t(`pieceNom_${idea.captured}` as Key, undefined, lang);
  }
  if ('target' in idea) {
    params.target = t(`piece_${idea.target}` as Key, undefined, lang);
    params.targetNom = t(`pieceNom_${idea.target}` as Key, undefined, lang);
  }
  if (idea.kind === 'fork') {
    params.t1 = t(`piece_${idea.targets[0]}` as Key, undefined, lang);
    params.t2 = t(`piece_${idea.targets[1]}` as Key, undefined, lang);
  }
  return fill(pick(tList(key, lang), seed), params);
}

function playedIdea(m: MoveReview): Idea {
  return describeMove(m.fenBefore, m.uci, { recaptureSquare: m.recaptureSquare, opening: m.phase === 'opening', endgame: m.phase === 'endgame' });
}

/** "Nf3 was stronger: develops the knight to f3." — only when the best move has a clear idea. */
function bestIdeaText(m: MoveReview, lang: Lang, seed: number): string {
  if (!m.bestMove || !m.bestSan) return '';
  const idea = describeMove(m.fenBefore, m.bestMove, { recaptureSquare: m.recaptureSquare, opening: m.phase === 'opening', endgame: m.phase === 'endgame' });
  const text = ideaText(idea, lang, seed);
  if (!text) return '';
  const lower = text.charAt(0).toLowerCase() + text.slice(1);
  return fill(pick(tList('r_bestIdea', lang), seed), { best: m.bestSan, idea: lower });
}

export interface MoveComment {
  reason: Reason;
  text: string;
}

/** Offline template comment for one move, in the requested language. */
export function commentFor(m: MoveReview, lang: Lang = getLang(), opts: { bubble?: boolean } = {}): MoveComment {
  const reason = findReason(m);
  const seed = m.ply * 7 + m.san.length;
  const p: Record<string, string | number> = { best: m.bestSan ?? '', played: m.san };

  if (reason.kind === 'mateDelivered') return { reason, text: pick(tList('c_mate_delivered', lang), seed) };

  switch (m.category) {
    case 'book': {
      const idea = ideaText(playedIdea(m), lang, seed);
      return { reason, text: idea ? `${idea} ${pick(tList('v_book', lang), seed + 1)}` : pick(tList('c_book', lang), seed) };
    }
    case 'brilliant': {
      const words = pieceWords(sacrificedPiece(m), lang);
      return { reason, text: fill(pick(tList('c_brilliant', lang), seed), { ...p, ...words }) };
    }
    case 'great':
    case 'best':
    case 'excellent':
    case 'good': {
      if (reason.kind === 'keepsMate') {
        const key = m.category === 'best' || m.category === 'great' ? 'c_best_mate' : 'c_keeps_mate';
        return { reason, text: fill(pick(tList(key, lang), seed), { ...p, n: reason.n }) };
      }
      // Say what the move does, then how good it was — like a coach, not a score sheet.
      const idea = ideaText(playedIdea(m), lang, seed);
      if (idea) {
        const verdict =
          m.category === 'great'
            ? fill(pick(tList('c_great', lang), seed + 1), p)
            : fill(pick(tList(`v_${m.category}` as Key, lang), seed + 1), p);
        return { reason, text: `${idea} ${verdict}` };
      }
      const key = `c_${m.category}` as Key;
      return { reason, text: fill(pick(tList(key, lang), seed), p) };
    }
    default: {
      // In the coach bubble the heading already says "X is a mistake" and the best move is shown
      // separately, so only the reason is needed.
      // A quiet ("positional") loss reads better as what the best move would have done.
      const bestIdea = reason.kind === 'positional' ? bestIdeaText(m, lang, seed + 1) : '';
      if (opts.bubble) {
        const reasonOnly = bestIdea || reasonText(reason, m, lang, seed + 1);
        if (reasonOnly) return { reason, text: reasonOnly };
      }
      // If the reason sentence already names the best move, use a short head to avoid repeating it.
      const namesBest = ['missedMate', 'missedCapture', 'missedCheck', 'positional'].includes(reason.kind);
      const headKey = (namesBest ? `c_${m.category}_short` : `c_${m.category}`) as Key;
      const head = fill(pick(tList(headKey, lang), seed), p);
      const tail = bestIdea || reasonText(reason, m, lang, seed + 1);
      return { reason, text: tail ? `${head} ${tail}` : head };
    }
  }
}

/** Piece type standing on the destination square after the move (for the sacrifice text). */
function sacrificedPiece(m: MoveReview): string {
  const board = m.fenAfter.split(' ')[0].split('/');
  const file = m.to.charCodeAt(0) - 97;
  const rank = 8 - Number(m.to[1]);
  let col = 0;
  for (const ch of board[rank]) {
    if (/\d/.test(ch)) col += Number(ch);
    else {
      if (col === file) return ch.toLowerCase();
      col++;
    }
  }
  return 'n';
}
