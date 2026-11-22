import { Chess, type Square } from 'chess.js';
import { BAD_CATEGORIES, CATEGORIES, type Category, type GameReview, type MoveReview } from '../analysis/classify';
import { CONFIG } from '../analysis/config';
import { formatEval, mateDistance, winPercentWhite } from '../analysis/evalMath';
import { PHASES } from '../analysis/phases';
import { materialBalance, playLine } from '../analysis/material';
import { commentFor } from '../comments/templates';
import { getLang, t, type Key } from '../i18n/i18n';
import { buildFacts, explainMove } from '../llm/claude';
import type { ParsedGame } from '../pgn/pgn';
import { getMe, type Settings } from '../settings';
import { Board } from './board';
import { EvalChart } from './chart';
import { clear, h } from './dom';
import { avatar, categoryIcon, uiIcon } from './icons';

const catLabel = (c: Category) => t(`cat_${c}` as Key);

/** Icon for a phase accuracy (thresholds in CONFIG.phases.icon). */
function formatClock(sec: number): string {
  const s = Math.max(0, sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  const two = (n: number) => String(n).padStart(2, '0');
  if (hh > 0) return `${hh}:${two(mm)}:${two(ss)}`;
  if (s < 20) return `${mm}:${two(ss)}.${Math.floor((s * 10) % 10)}`;
  return `${mm}:${two(ss)}`;
}

function phaseCategory(acc: number): Category {
  const t = CONFIG.phases.icon;
  if (acc >= t.best) return 'best';
  if (acc >= t.excellent) return 'excellent';
  if (acc >= t.good) return 'good';
  if (acc >= t.inaccuracy) return 'inaccuracy';
  if (acc >= t.mistake) return 'mistake';
  return 'blunder';
}

interface RetryState {
  move: MoveReview;
  selected: string | null;
  feedback: { kind: 'prompt' | 'ok' | 'wrong'; text: string };
  fen: string;
  lastTry: { from: string; to: string } | null;
}

/**
 * Review screen: board column (player strips, eval bar, board) and a side panel that
 * opens with a summary and then walks through the key moves with a coach bubble.
 */
export class ReportView {
  readonly el: HTMLElement;
  private ply = 0;
  private mode: 'summary' | 'review' = 'summary';
  private board = new Board();
  private chart: EvalChart;
  private evalFill = h('div', { class: 'evalbar-fill' });
  private evalText = h('div', { class: 'evalbar-text' });
  private topStrip = h('div', { class: 'player-strip' });
  private bottomStrip = h('div', { class: 'player-strip' });
  private panelBody = h('div', { class: 'panel-body' });
  private panelFoot = h('div', { class: 'panel-foot' });
  private moveListEl = h('div', { class: 'movelist', role: 'list' });
  private lineTimer: number | null = null;
  private playingLine = false;
  private retry: RetryState | null = null;
  private llmCache = new Map<string, string>();
  private llmAbort: AbortController | null = null;
  private keyPlies: number[];
  private keyHandler = (e: KeyboardEvent) => this.onKey(e);
  /** Summary toggles: all ten categories, and the phase table. */
  private showAllCats = false;
  private showAdvanced = true;
  /** The colour of the player who imported the game (their side goes to the bottom), if known. */
  private me: 'w' | 'b' | null;

  constructor(
    private game: ParsedGame,
    private review: GameReview,
    private settings: () => Settings,
    private openSettings: () => void,
  ) {
    this.chart = new EvalChart((p) => {
      this.mode = 'review';
      this.goto(p);
    });
    this.keyPlies = this.computeKeyPlies();
    const me = getMe().toLowerCase();
    this.me = !me ? null : game.headers.white.toLowerCase() === me ? 'w' : game.headers.black.toLowerCase() === me ? 'b' : null;
    this.el = h('div', { class: 'report' });
    if (this.me === 'b') {
      this.board.setFlipped(true);
      this.el.classList.add('flipped');
    }
    this.build();
    document.addEventListener('keydown', this.keyHandler);
    this.goto(0);
  }

  destroy() {
    document.removeEventListener('keydown', this.keyHandler);
    this.stopLine();
    this.llmAbort?.abort();
  }

  rerender() {
    clear(this.el);
    this.build();
    this.goto(this.ply);
  }

  /** Key moments: every error, every brilliant/great move and the last book move. */
  private computeKeyPlies(): number[] {
    const keys = new Set<number>();
    let lastBook = 0;
    for (const m of this.review.moves) {
      if (m.category === 'book') lastBook = m.ply;
      if (BAD_CATEGORIES.has(m.category) || m.category === 'brilliant' || m.category === 'great') keys.add(m.ply);
    }
    if (lastBook) keys.add(lastBook);
    return [...keys].sort((a, b) => a - b);
  }

  // ---------------------------------------------------------------- layout
  private build() {
    const evalbar = h('div', { class: 'evalbar', 'aria-hidden': 'true' }, this.evalFill, this.evalText);
    const boardCol = h(
      'div',
      { class: 'board-col' },
      this.topStrip,
      h('div', { class: 'board-row' }, evalbar, h('div', { class: 'board-box' }, this.board.el)),
      this.bottomStrip,
    );
    const panel = h(
      'aside',
      { class: 'panel' },
      h('div', { class: 'panel-head' }, h('span', { class: 'panel-head-icon' }, uiIcon('star', 16)), h('span', null, t('gameReview'))),
      this.panelBody,
      this.panelFoot,
    );
    this.chart.setReview(this.review);
    this.el.append(boardCol, panel);
  }

  private renderStrips() {
    const hd = this.game.headers;
    const flipped = this.board.isFlipped();
    const fen = this.game.fens[this.ply];
    const mat = materialBalance(fen);
    const strip = (el: HTMLElement, color: 'w' | 'b') => {
      clear(el);
      const name = color === 'w' ? hd.white : hd.black;
      const elo = color === 'w' ? hd.whiteElo : hd.blackElo;
      const adv = color === 'w' ? mat : -mat;
      el.append(
        avatar(color, 34),
        h('div', { class: 'ps-name' }, h('strong', null, name), elo ? h('span', { class: 'ps-elo' }, ` (${elo})`) : null),
      );
      if (adv > 0) el.append(h('span', { class: 'ps-adv' }, `+${adv}`));
      const left = this.clockAt(color);
      if (left !== null) {
        const toMove = this.game.fens[this.ply].split(' ')[1] === color;
        el.append(h('div', { class: `ps-clock clock-${color}${toMove ? ' active' : ''}` }, formatClock(left)));
      }
    };
    strip(this.topStrip, flipped ? 'w' : 'b');
    strip(this.bottomStrip, flipped ? 'b' : 'w');
  }

  /** Seconds left for `color` at the current ply: their clock after their last move so far. */
  private clockAt(color: 'w' | 'b'): number | null {
    const clocks = this.game.clocks;
    if (!clocks) return null;
    for (let i = this.ply - 1; i >= 0; i--) if (this.game.plies[i].color === color) return clocks[i];
    return this.game.baseClock ?? null;
  }

  // ---------------------------------------------------------------- navigation
  goto(ply: number) {
    this.stopLine();
    this.retry = null;
    this.board.onSquareClick = null;
    this.ply = Math.max(0, Math.min(this.review.moves.length, ply));
    this.renderBoard();
    this.renderStrips();
    this.setEvalBar(this.review.evals[this.ply]);
    this.chart.setCurrent(this.ply);
    this.renderPanel();
  }

  private current(): MoveReview | null {
    return this.ply > 0 ? this.review.moves[this.ply - 1] : null;
  }

  private renderBoard() {
    const m = this.current();
    // Book moves are theory: no "better move" arrow, like on the big sites.
    const arrowUci = m && !m.isBest && m.category !== 'book' && m.bestMove ? m.bestMove : null;
    this.board.render({
      fen: this.game.fens[this.ply],
      lastMove: m ? { from: m.from, to: m.to } : null,
      lastMoveCategory: m?.category ?? null,
      arrow: arrowUci ? { from: arrowUci.slice(0, 2), to: arrowUci.slice(2, 4) } : null,
      badge: m ? { square: m.to, category: m.category } : null,
    });
  }

  private setEvalBar(ev: number) {
    const w = winPercentWhite(ev);
    this.evalFill.style.height = `${w}%`;
    // Short form like the big sites: "0.7", "3.2", "M4" — the side is shown by where it sits.
    const mate = mateDistance(ev);
    this.evalText.textContent = mate !== null ? (mate === 0 ? (ev > 0 ? '1-0' : '0-1') : `M${mate}`) : (Math.abs(ev) / 100).toFixed(1);
    this.evalText.classList.toggle('on-white', w >= 50);
  }

  private nextKey() {
    const next = this.keyPlies.find((p) => p > this.ply);
    this.mode = 'review';
    if (next === undefined) {
      this.goto(this.review.moves.length);
      const b = this.panelBody.querySelector('.bubble-text');
      if (b) b.textContent = t('reviewDone');
    } else this.goto(next);
  }

  private onKey(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (document.querySelector('dialog[open]')) return;
    const go = (p: number) => {
      this.mode = 'review';
      this.goto(p);
    };
    if (e.key === 'ArrowLeft') go(this.ply - 1);
    else if (e.key === 'ArrowRight') go(this.ply + 1);
    else if (e.key === 'ArrowUp' || e.key === 'Home') go(0);
    else if (e.key === 'ArrowDown' || e.key === 'End') go(this.review.moves.length);
    else if (e.key === 'f') this.flip();
    else return;
    e.preventDefault();
  }

  private flip() {
    this.board.setFlipped(!this.board.isFlipped());
    this.el.classList.toggle('flipped', this.board.isFlipped());
    this.renderStrips();
  }

  // ---------------------------------------------------------------- panel
  private renderPanel() {
    clear(this.panelBody);
    clear(this.panelFoot);
    this.panelBody.scrollTop = 0;
    if (this.mode === 'summary') this.renderSummary();
    else this.renderReview();
  }

  private bubble(content: (Node | null)[]): HTMLElement {
    return h(
      'div',
      { class: 'coach' },
      avatar('coach', 40),
      h('div', { class: 'bubble' }, ...content.filter((n): n is Node => n !== null)),
    );
  }

  private renderSummary() {
    const r = this.review;
    const hd = this.game.headers;
    const bottom: 'w' | 'b' = this.board.isFlipped() ? 'b' : 'w';
    const row = (label: Node | string, w: Node | string, b: Node | string, cls = '') =>
      h('div', { class: `sum-row ${cls}` }, h('div', { class: 'sum-label' }, label), h('div', { class: 'sum-w' }, w), h('div', { class: 'sum-mid' }), h('div', { class: 'sum-b' }, b));
    const nameCell = (color: 'w' | 'b') => h('div', { class: 'sum-name', title: color === 'w' ? hd.white : hd.black }, color === 'w' ? hd.white : hd.black);
    const avatarCell = (color: 'w' | 'b') =>
      h('div', { class: `sum-avatar${color === (this.me ?? bottom) ? ' me' : ''}` }, avatar(color, 64));
    const accBox = (v: number | null, color: 'w' | 'b') => h('div', { class: `acc-box acc-${color}` }, v === null ? '—' : v.toFixed(1));
    const ratingBox = (v: number | null, color: 'w' | 'b') =>
      h('div', { class: `acc-box acc-${color} rating-box`, title: t('gameRatingHint') }, v === null ? '—' : String(v));
    const phaseCell = (v: number | null) =>
      v === null
        ? h('div', { class: 'phase-cell muted' }, '—')
        : h(
            'div',
            { class: `phase-cell cat-text-${phaseCategory(v)}`, title: t('phaseHint', { a: v.toFixed(1) }) },
            categoryIcon(phaseCategory(v), 24),
            h('span', { class: 'phase-acc' }, v.toFixed(0)),
          );
    const sep = () => h('div', { class: 'sum-sep' });

    const table = h('div', { class: 'sum-table' });
    table.append(
      row('', nameCell('w'), nameCell('b'), 'names'),
      row(t('players'), avatarCell('w'), avatarCell('b'), 'players'),
      row(t('accuracy'), accBox(r.accuracy.w, 'w'), accBox(r.accuracy.b, 'b'), 'acc'),
      sep(),
    );
    // Like the big sites: the key categories first, the rest behind a chevron.
    const shortList: Category[] = ['brilliant', 'great', 'best', 'excellent', 'mistake', 'miss', 'blunder'];
    const cats = CATEGORIES.filter(
      (c) => this.showAllCats || (shortList.includes(c) && (c !== 'brilliant' || r.counts.w[c] + r.counts.b[c] > 0)),
    );
    for (const c of cats) {
      table.append(
        h(
          'div',
          { class: `sum-row cat-row cat-text-${c}` },
          h('div', { class: 'sum-label' }, catLabel(c)),
          h('div', { class: 'sum-w num' }, String(r.counts.w[c])),
          h('div', { class: 'sum-mid' }, categoryIcon(c, 26)),
          h('div', { class: 'sum-b num' }, String(r.counts.b[c])),
        ),
      );
    }
    table.append(
      h(
        'button',
        {
          class: `sum-chevron${this.showAllCats ? ' open' : ''}`,
          'aria-label': t('showAllCats'),
          'aria-expanded': String(this.showAllCats),
          on: { click: () => ((this.showAllCats = !this.showAllCats), this.renderPanel()) },
        },
        uiIcon('chevron', 22),
      ),
      sep(),
      row(t('gameRating'), ratingBox(r.gameRating.w, 'w'), ratingBox(r.gameRating.b, 'b'), 'rating'),
      sep(),
      h(
        'button',
        {
          class: `sum-advanced${this.showAdvanced ? ' open' : ''}`,
          'aria-expanded': String(this.showAdvanced),
          on: { click: () => ((this.showAdvanced = !this.showAdvanced), this.renderPanel()) },
        },
        t('advancedStats'),
      ),
    );
    if (this.showAdvanced) {
      for (const ph of PHASES) {
        if (r.phases[ph].w === null && r.phases[ph].b === null) continue;
        table.append(row(t(`phase_${ph}` as Key), phaseCell(r.phases[ph].w), phaseCell(r.phases[ph].b), 'phase'));
      }
      if (r.opening) table.append(h('p', { class: 'sum-opening' }, r.opening));
    }
    this.panelBody.append(table);
    this.panelFoot.append(h('button', { class: 'btn btn-green btn-xl', on: { click: () => this.nextKey() } }, t('startReview')));
  }

  private renderReview() {
    const m = this.current();
    const lang = getLang();
    if (!m) {
      this.panelBody.append(this.bubble([h('p', { class: 'bubble-text' }, t('pickMoveHint'))]));
    } else {
      const c = commentFor(m, lang, { bubble: true });
      const evChip = h('span', { class: `eval-chip ${winPercentWhite(m.evalAfter) >= 50 ? 'white' : 'black'}` }, formatEval(m.evalAfter).replace('−', '-'));
      const head = h(
        'div',
        { class: `bubble-head cat-text-${m.category}` },
        categoryIcon(m.category, 26),
        h('strong', null, t('moveIs', { san: m.san, phrase: t(`catPhrase_${m.category}` as Key) })),
        evChip,
      );
      const parts: (Node | null)[] = [head, h('p', { class: 'bubble-text' }, c.text)];
      const hasBetter = !!m.bestSan && !m.isBest && m.category !== 'book';
      if (hasBetter) {
        parts.push(h('p', { class: 'bubble-best' }, categoryIcon('best', 18), h('span', null, `${t('bestWas')}: `), h('strong', null, m.bestSan)));
      }
      if (this.retry) parts.push(h('p', { class: `retry-msg ${this.retry.feedback.kind}` }, this.retry.feedback.text));

      const actions = h('div', { class: 'bubble-actions' });
      if (hasBetter) {
        actions.append(
          h('button', { class: 'btn btn-dark', on: { click: () => this.showBest(m) } }, uiIcon('bulb', 16), t('bestMoveBtn')),
          h('button', { class: 'btn btn-dark', on: { click: () => this.startRetry(m) } }, uiIcon('retry', 16), t('retry')),
        );
      }
      if (m.bestLine.length) {
        const lineBtn: HTMLButtonElement = h(
          'button',
          { class: 'btn btn-dark', on: { click: () => (this.playingLine ? this.stopLine(true) : this.playBestLine(m, lineBtn)) } },
          uiIcon('play', 16),
          t('showBestLine'),
        );
        actions.append(lineBtn);
      }
      const llmOut = h('div', { class: 'llm-out', 'aria-live': 'polite' });
      const cacheKey = `${m.ply}|${lang}|${this.settings().model}`;
      if (this.llmCache.has(cacheKey)) llmOut.append(h('p', { class: 'llm-text' }, this.llmCache.get(cacheKey)!));
      const hasKey = !!this.settings().apiKey;
      if (hasKey) {
        const explainBtn: HTMLButtonElement = h(
          'button',
          { class: 'btn btn-dark', on: { click: () => this.explain(m, llmOut, explainBtn, cacheKey) } },
          uiIcon('spark', 16),
          t('explain'),
        );
        actions.append(explainBtn);
      }
      parts.push(actions);
      parts.push(
        hasKey
          ? llmOut
          : h('p', { class: 'need-key' }, t('needKey'), ' ', h('button', { class: 'link-btn', on: { click: () => this.openSettings() } }, t('openSettings'))),
      );
      this.panelBody.append(this.bubble(parts));
    }

    this.panelBody.append(h('div', { class: 'panel-chart small' }, this.chart.el));
    this.renderMoveList();
    this.panelBody.append(this.moveListEl);
    requestAnimationFrame(() => this.scrollActiveMove());

    const navBtn = (icon: Parameters<typeof uiIcon>[0], label: Key, fn: () => void) =>
      h('button', { class: 'nav-btn', title: t(label), 'aria-label': t(label), on: { click: fn } }, uiIcon(icon, 22));
    this.panelFoot.append(
      h(
        'div',
        { class: 'nav-row' },
        navBtn('first', 'first', () => this.goto(0)),
        navBtn('prev', 'prev', () => this.goto(this.ply - 1)),
        navBtn('next', 'next', () => this.goto(this.ply + 1)),
        navBtn('last', 'last', () => this.goto(this.review.moves.length)),
        navBtn('flip', 'flip', () => this.flip()),
      ),
      h(
        'div',
        { class: 'foot-buttons' },
        h('button', { class: 'btn btn-dark btn-lg', on: { click: () => { this.mode = 'summary'; this.goto(this.ply); } } }, t('overview')),
        h('button', { class: 'btn btn-green btn-lg', on: { click: () => this.nextKey() } }, t('nextKey'), uiIcon('next', 18)),
      ),
    );
  }

  private renderMoveList() {
    clear(this.moveListEl);
    const moves = this.review.moves;
    const cell = (m: MoveReview | undefined) =>
      m
        ? h(
            'button',
            {
              class: `mv cat-text-${m.category} ${m.ply === this.ply ? 'active' : ''}`,
              'data-ply': String(m.ply),
              title: catLabel(m.category),
              on: { click: () => this.goto(m.ply) },
            },
            categoryIcon(m.category, 16),
            h('span', { class: 'san' }, m.san),
          )
        : h('span', { class: 'mv empty' });
    let i = 0;
    if (moves[0]?.color === 'b') {
      this.moveListEl.append(h('div', { class: 'mv-row' }, h('span', { class: 'mv-num' }, `${moves[0].moveNumber}.`), h('span', { class: 'mv empty' }, '…'), cell(moves[0])));
      i = 1;
    }
    for (; i < moves.length; i += 2) {
      this.moveListEl.append(h('div', { class: 'mv-row', role: 'listitem' }, h('span', { class: 'mv-num' }, `${moves[i].moveNumber}.`), cell(moves[i]), cell(moves[i + 1])));
    }
  }

  private scrollActiveMove() {
    const active = this.moveListEl.querySelector('.mv.active') as HTMLElement | null;
    if (!active) return;
    const box = this.moveListEl;
    const a = active.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    if (a.top < b.top || a.bottom > b.bottom) box.scrollTop += a.top - b.top - b.height / 2 + a.height / 2;
  }

  // ---------------------------------------------------------------- actions
  private showBest(m: MoveReview) {
    this.stopLine();
    if (!m.bestMove) return;
    const after = playLine(m.fenBefore, [m.bestMove]).fen;
    this.board.render({
      fen: after,
      lastMove: { from: m.bestMove.slice(0, 2), to: m.bestMove.slice(2, 4) },
      lastMoveCategory: 'best',
      badge: { square: m.bestMove.slice(2, 4), category: 'best' },
    });
  }

  private startRetry(m: MoveReview) {
    this.stopLine();
    this.retry = { move: m, selected: null, feedback: { kind: 'prompt', text: t('retryPrompt') }, fen: m.fenBefore, lastTry: null };
    this.board.onSquareClick = (sq) => this.retryClick(sq);
    this.renderRetryBoard();
    this.renderPanel();
  }

  private renderRetryBoard() {
    const r = this.retry!;
    const chess = new Chess(r.fen);
    const targets = r.selected ? chess.moves({ square: r.selected as Square, verbose: true }).map((mv) => mv.to) : [];
    this.board.render({ fen: r.fen, selected: r.selected, targets, lastMove: r.lastTry });
  }

  private retryClick(sq: string) {
    const r = this.retry;
    if (!r || r.feedback.kind === 'ok') return;
    const chess = new Chess(r.move.fenBefore);
    r.fen = r.move.fenBefore;
    r.lastTry = null;
    const piece = chess.get(sq as Square);
    const own = !!piece && piece.color === chess.turn();
    const legal = r.selected ? chess.moves({ square: r.selected as Square, verbose: true }).find((mv) => mv.to === sq) : undefined;
    if (!legal) {
      r.selected = own ? sq : null;
      this.renderRetryBoard();
      return;
    }
    const uci = legal.from + legal.to + (legal.promotion ? 'q' : '');
    chess.move({ from: legal.from, to: legal.to, promotion: legal.promotion ? 'q' : undefined });
    r.fen = chess.fen();
    r.selected = null;
    r.lastTry = { from: legal.from, to: legal.to };
    const bestUci = r.move.bestMove ?? '';
    const correct = uci === bestUci || (bestUci.length === 5 && uci.slice(0, 4) === bestUci.slice(0, 4));
    r.feedback = correct ? { kind: 'ok', text: t('retryCorrect', { san: legal.san }) } : { kind: 'wrong', text: t('retryWrong', { san: legal.san }) };
    if (correct) this.board.onSquareClick = null;
    this.renderRetryBoard();
    this.renderPanel();
    if (!correct) {
      window.setTimeout(() => {
        if (this.retry !== r) return;
        r.fen = r.move.fenBefore;
        r.lastTry = null;
        this.renderRetryBoard();
      }, 900);
    }
  }

  private async explain(m: MoveReview, out: HTMLElement, btn: HTMLButtonElement, cacheKey: string) {
    const s = this.settings();
    this.llmAbort?.abort();
    const ac = new AbortController();
    this.llmAbort = ac;
    btn.disabled = true;
    clear(out);
    out.append(h('p', { class: 'muted' }, t('explaining')));
    try {
      const text = await explainMove(buildFacts(m, getLang()), s.apiKey, s.model, ac.signal);
      this.llmCache.set(cacheKey, text);
      clear(out);
      out.append(h('p', { class: 'llm-text' }, text));
    } catch (e) {
      if (ac.signal.aborted) return;
      clear(out);
      out.append(h('p', { class: 'error' }, t('llmError', { msg: (e as Error).message })));
    } finally {
      btn.disabled = false;
    }
  }

  private playBestLine(m: MoveReview, btn: HTMLButtonElement) {
    const fens = [m.fenBefore];
    const moves: Array<{ from: string; to: string }> = [];
    let fen = m.fenBefore;
    for (const u of m.bestLine.slice(0, 10)) {
      const r = playLine(fen, [u]);
      if (!r.san.length) break;
      fen = r.fen;
      fens.push(fen);
      moves.push({ from: u.slice(0, 2), to: u.slice(2, 4) });
    }
    let idx = 0;
    this.playingLine = true;
    btn.replaceChildren(uiIcon('stop', 16), t('stopLine'));
    this.el.classList.add('showing-line');
    const step = () => {
      if (!this.playingLine) return;
      if (idx >= moves.length) {
        this.lineTimer = window.setTimeout(() => this.stopLine(true), 1600);
        return;
      }
      idx++;
      this.board.render({ fen: fens[idx], lastMove: moves[idx - 1] });
      this.lineTimer = window.setTimeout(step, 850);
    };
    this.board.render({ fen: m.fenBefore });
    this.lineTimer = window.setTimeout(step, 400);
  }

  private stopLine(restore = false) {
    if (!this.playingLine) return;
    if (this.lineTimer) clearTimeout(this.lineTimer);
    this.lineTimer = null;
    this.playingLine = false;
    this.el.classList.remove('showing-line');
    if (restore) this.goto(this.ply);
  }
}
