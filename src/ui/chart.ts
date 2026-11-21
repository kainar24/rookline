import type { Category, GameReview } from '../analysis/classify';
import { formatEval } from '../analysis/evalMath';
import { t, type Key } from '../i18n/i18n';
import { categoryBadgeInner } from './icons';
import { h, s } from './dom';

/** Categories that get a marker on the graph. Identity is carried by the glyph tile, not colour alone. */
const MARKED: ReadonlySet<Category> = new Set(['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder']);

const W = 800;
const H = 200;
const PAD_T = 10;
const PAD_B = 10;

/**
 * Win% for White across the game as an area chart (one y-scale, 0..100, 50 = equal).
 * Click or drag to jump to a move; hover shows a crosshair + tooltip.
 */
export class EvalChart {
  readonly el: HTMLElement;
  private svg: SVGSVGElement;
  private cursor!: SVGLineElement;
  private hoverLine!: SVGLineElement;
  private tip: HTMLDivElement;
  private review: GameReview | null = null;

  constructor(private onSelect: (ply: number) => void) {
    this.svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', preserveAspectRatio: 'none' });
    this.tip = h('div', { class: 'chart-tip', hidden: true });
    this.el = h('div', { class: 'chart-wrap' }, this.svg, this.tip);
    const pick = (e: PointerEvent) => {
      const ply = this.plyAt(e.clientX);
      if (ply !== null) this.onSelect(ply);
    };
    this.el.addEventListener('pointerdown', (e) => {
      this.el.setPointerCapture(e.pointerId);
      pick(e);
    });
    this.el.addEventListener('pointermove', (e) => {
      if (e.buttons & 1) pick(e);
      this.hover(e.clientX);
    });
    this.el.addEventListener('pointerleave', () => this.hideHover());
  }

  private n(): number {
    return this.review ? this.review.whiteWin.length - 1 : 0;
  }
  private x(ply: number): number {
    const n = Math.max(1, this.n());
    return (ply / n) * W;
  }
  private y(win: number): number {
    return PAD_T + (1 - win / 100) * (H - PAD_T - PAD_B);
  }

  private plyAt(clientX: number): number | null {
    if (!this.review) return null;
    const r = this.svg.getBoundingClientRect();
    const rel = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(rel * this.n());
  }

  setReview(review: GameReview) {
    this.review = review;
    const svg = this.svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const pts = review.whiteWin.map((w, i) => [this.x(i), this.y(w)] as const);
    const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
    // Area under the line = White's share; the rest of the band is Black's.
    svg.appendChild(s('rect', { x: 0, y: 0, width: W, height: H, class: 'chart-black' }));
    svg.appendChild(s('path', { d: `${line} L${W},${H} L0,${H} Z`, class: 'chart-white' }));
    svg.appendChild(s('line', { x1: 0, x2: W, y1: this.y(50), y2: this.y(50), class: 'chart-mid' }));
    svg.appendChild(s('path', { d: line, class: 'chart-line', 'vector-effect': 'non-scaling-stroke' }));
    this.hoverLine = s('line', { x1: 0, x2: 0, y1: 0, y2: H, class: 'chart-hover', 'vector-effect': 'non-scaling-stroke' });
    this.hoverLine.style.display = 'none';
    svg.appendChild(this.hoverLine);
    this.cursor = s('line', { x1: 0, x2: 0, y1: 0, y2: H, class: 'chart-cursor', 'vector-effect': 'non-scaling-stroke' });
    svg.appendChild(this.cursor);

    // Markers are HTML-positioned so they stay round while the SVG stretches.
    this.el.querySelectorAll('.chart-mark').forEach((m) => m.remove());
    for (const m of review.moves) {
      if (!MARKED.has(m.category)) continue;
      const mark = h('div', {
        class: `chart-mark cat-${m.category}`,
        style: `left:${(this.x(m.ply) / W) * 100}%;top:${(this.y(review.whiteWin[m.ply]) / H) * 100}%`,
        title: `${m.moveNumber}${m.color === 'w' ? '.' : '…'} ${m.san} · ${t(`cat_${m.category}` as Key)}`,
      });
      mark.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">${categoryBadgeInner(m.category)}</svg>`;
      this.el.appendChild(mark);
    }
  }

  setCurrent(ply: number) {
    if (!this.cursor) return;
    const x = this.x(ply);
    this.cursor.setAttribute('x1', String(x));
    this.cursor.setAttribute('x2', String(x));
  }

  private hover(clientX: number) {
    const ply = this.plyAt(clientX);
    if (ply === null || !this.review) return;
    const x = this.x(ply);
    this.hoverLine.style.display = '';
    this.hoverLine.setAttribute('x1', String(x));
    this.hoverLine.setAttribute('x2', String(x));
    const m = ply > 0 ? this.review.moves[ply - 1] : null;
    const ev = formatEval(this.review.evals[ply]);
    const label = m ? `${m.moveNumber}${m.color === 'w' ? '.' : '…'} ${m.san}` : t('startPosition');
    this.tip.textContent = '';
    this.tip.append(h('strong', null, label), h('span', null, ` ${ev}`));
    if (m) this.tip.append(h('span', { class: `tip-cat cat-text-${m.category}` }, ` · ${t(`cat_${m.category}` as Key)}`));
    this.tip.hidden = false;
    const pct = x / W;
    this.tip.style.left = `${pct * 100}%`;
    this.tip.style.transform = `translateX(${pct > 0.8 ? '-100%' : pct < 0.2 ? '0' : '-50%'})`;
  }

  private hideHover() {
    this.tip.hidden = true;
    if (this.hoverLine) this.hoverLine.style.display = 'none';
  }
}
