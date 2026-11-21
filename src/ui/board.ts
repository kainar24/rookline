import type { Category } from '../analysis/classify';
import { categoryBadgeInner } from './icons';
import { s } from './dom';

export interface BoardState {
  fen: string;
  lastMove?: { from: string; to: string } | null;
  /** Tint the last-move squares with this category's colour instead of the neutral highlight. */
  lastMoveCategory?: Category | null;
  arrow?: { from: string; to: string } | null;
  badge?: { square: string; category: Category } | null;
  /** Selected square and its legal targets (for the "Retry" mode). */
  selected?: string | null;
  targets?: string[];
}

const SQ = 100;
const FILES = 'abcdefgh';

function pieceHref(color: 'w' | 'b', type: string): string {
  return `${import.meta.env.BASE_URL}pieces/cburnett/${color}${type.toUpperCase()}.svg`;
}

/** SVG chessboard: last-move tint, best-move arrow, category badge, click-to-move. */
export class Board {
  readonly el: SVGSVGElement;
  private flipped = false;
  private state: BoardState | null = null;
  onSquareClick: ((sq: string) => void) | null = null;

  constructor() {
    this.el = s('svg', { viewBox: `0 0 ${SQ * 8} ${SQ * 8}`, class: 'board', role: 'img' });
    this.el.addEventListener('click', (e) => {
      if (!this.onSquareClick) return;
      const r = this.el.getBoundingClientRect();
      const col = Math.floor(((e.clientX - r.left) / r.width) * 8);
      const row = Math.floor(((e.clientY - r.top) / r.height) * 8);
      if (col < 0 || col > 7 || row < 0 || row > 7) return;
      const f = this.flipped ? 7 - col : col;
      const rank = this.flipped ? row + 1 : 8 - row;
      this.onSquareClick(FILES[f] + rank);
    });
  }

  setFlipped(f: boolean) {
    this.flipped = f;
    if (this.state) this.render(this.state);
  }
  isFlipped() {
    return this.flipped;
  }

  private xy(sq: string): [number, number] {
    const f = FILES.indexOf(sq[0]);
    const r = Number(sq[1]) - 1;
    const col = this.flipped ? 7 - f : f;
    const row = this.flipped ? r : 7 - r;
    return [col * SQ, row * SQ];
  }

  render(st: BoardState) {
    this.state = st;
    const svg = this.el;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('aria-label', st.fen);
    svg.classList.toggle('clickable', !!this.onSquareClick);

    const defs = s('defs');
    defs.appendChild(
      s(
        'marker',
        { id: 'arrowhead', viewBox: '0 0 10 10', refX: '5', refY: '5', markerWidth: '2.6', markerHeight: '2.6', orient: 'auto-start-reverse' },
        s('path', { d: 'M0,0 L10,5 L0,10 z', fill: 'var(--arrow)' }),
      ),
    );
    svg.appendChild(defs);

    const isLight = (sq: string) => (FILES.indexOf(sq[0]) + Number(sq[1]) - 1) % 2 === 1;
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const sq = FILES[f] + (r + 1);
        const [x, y] = this.xy(sq);
        svg.appendChild(s('rect', { x, y, width: SQ, height: SQ, class: isLight(sq) ? 'sq-light' : 'sq-dark' }));
      }
    }

    if (st.lastMove) {
      for (const sq of [st.lastMove.from, st.lastMove.to]) {
        const [x, y] = this.xy(sq);
        const cls = st.lastMoveCategory ? `sq-cat cat-fill-${st.lastMoveCategory}` : 'sq-last';
        svg.appendChild(s('rect', { x, y, width: SQ, height: SQ, class: cls }));
      }
    }
    if (st.selected) {
      const [x, y] = this.xy(st.selected);
      svg.appendChild(s('rect', { x, y, width: SQ, height: SQ, class: 'sq-selected' }));
    }

    // coordinates inside the edge squares
    const bottomRank = this.flipped ? 8 : 1;
    const leftFile = this.flipped ? 'h' : 'a';
    for (let i = 0; i < 8; i++) {
      const file = this.flipped ? FILES[7 - i] : FILES[i];
      const rank = this.flipped ? i + 1 : 8 - i;
      const ft = s('text', { x: i * SQ + SQ - 6, y: 8 * SQ - 7, class: `coord ${isLight(file + bottomRank) ? 'on-light' : 'on-dark'}`, 'text-anchor': 'end' });
      ft.textContent = file;
      svg.appendChild(ft);
      const rt = s('text', { x: 6, y: i * SQ + 24, class: `coord ${isLight(leftFile + rank) ? 'on-light' : 'on-dark'}` });
      rt.textContent = String(rank);
      svg.appendChild(rt);
    }

    const board = st.fen.split(' ')[0].split('/');
    board.forEach((row, ri) => {
      let fi = 0;
      for (const ch of row) {
        if (/\d/.test(ch)) {
          fi += Number(ch);
          continue;
        }
        const sq = FILES[fi] + (8 - ri);
        const [x, y] = this.xy(sq);
        const color = ch === ch.toUpperCase() ? 'w' : 'b';
        svg.appendChild(s('image', { href: pieceHref(color, ch), x, y, width: SQ, height: SQ, class: 'piece' }));
        fi++;
      }
    });

    for (const tsq of st.targets ?? []) {
      const [x, y] = this.xy(tsq);
      svg.appendChild(s('circle', { cx: x + SQ / 2, cy: y + SQ / 2, r: 15, class: 'target-dot' }));
    }

    if (st.arrow && st.arrow.from !== st.arrow.to) {
      const [x1, y1] = this.xy(st.arrow.from);
      const [x2, y2] = this.xy(st.arrow.to);
      const cx1 = x1 + SQ / 2, cy1 = y1 + SQ / 2, cx2 = x2 + SQ / 2, cy2 = y2 + SQ / 2;
      const len = Math.hypot(cx2 - cx1, cy2 - cy1);
      const trim = 30;
      const ex = cx2 - ((cx2 - cx1) / len) * trim;
      const ey = cy2 - ((cy2 - cy1) / len) * trim;
      svg.appendChild(s('line', { x1: cx1, y1: cy1, x2: ex, y2: ey, class: 'arrow', 'marker-end': 'url(#arrowhead)' }));
    }

    if (st.badge) {
      const [x, y] = this.xy(st.badge.square);
      const g = s('g', { transform: `translate(${x + SQ - 30}, ${y - 12}) scale(1.75)`, class: 'badge' });
      g.innerHTML = categoryBadgeInner(st.badge.category);
      svg.appendChild(g);
    }
  }
}
