import { chesscomMonth, chesscomRecent, ImportError, lichessRecent, type RemoteGame } from '../importers/importers';
import { t, type Key } from '../i18n/i18n';
import { summariseGames, type GameSummary } from '../pgn/pgn';
import { rememberMe } from '../settings';
import { clear, h } from './dom';
import { uiIcon } from './icons';

export type Tab = 'pgn' | 'file' | 'chesscom' | 'lichess';

/** A short real game for the "sample" button (Morphy's Opera Game, 1858, public domain). */
export const SAMPLE_PGN = `[Event "Paris"]
[Site "Paris FRA"]
[Date "1858.11.02"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

function importMessage(e: unknown, user: string): string {
  if (e instanceof ImportError) {
    switch (e.code) {
      case 'no-user':
        return t('errNoUser');
      case 'not-found':
        return t('errUserNotFound', { user });
      case 'empty':
        return t('errEmptyArchive', { user });
      case 'rate-limit':
        return t('errRateLimit');
      default:
        return t('errNetwork', { msg: e.message });
    }
  }
  return t('errNetwork', { msg: (e as Error).message });
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return d.toISOString().slice(0, 10);
}

/** Input screen with the four ways to load a game. Calls `onPick(pgn)` with one game. */
export class InputView {
  readonly el: HTMLElement;
  private tab: Tab;
  private pgnText = '';
  private fileGames: GameSummary[] | null = null;
  private fileName = '';
  private remote: Record<'chesscom' | 'lichess', { user: string; games: RemoteGame[]; archives?: string[]; used?: number; error?: string; loading?: boolean }> = {
    chesscom: { user: '', games: [] },
    lichess: { user: '', games: [] },
  };

  constructor(
    private onPick: (pgn: string) => void,
    private error: string | null = null,
    tab: Tab = 'pgn',
  ) {
    this.tab = tab;
    this.el = h('section', { class: 'input-view' });
    this.render();
  }

  setError(msg: string | null) {
    this.error = msg;
    this.render();
  }

  render() {
    const el = this.el;
    clear(el);
    const tabs: Tab[] = ['pgn', 'file', 'chesscom', 'lichess'];
    const tabKey: Record<Tab, Key> = { pgn: 'tabPgn', file: 'tabFile', chesscom: 'tabChesscom', lichess: 'tabLichess' };
    el.append(
      h('h1', { class: 'input-title' }, t('inputTitle')),
      h('p', { class: 'muted tagline' }, t('tagline')),
      h(
        'div',
        { class: 'tabs', role: 'tablist' },
        tabs.map((tb) =>
          h(
            'button',
            {
              class: `tab ${tb === this.tab ? 'active' : ''}`,
              role: 'tab',
              'aria-selected': String(tb === this.tab),
              on: {
                click: () => {
                  this.tab = tb;
                  this.error = null;
                  this.render();
                },
              },
            },
            t(tabKey[tb]),
          ),
        ),
      ),
    );
    const panel = h('div', { class: 'card tab-panel', role: 'tabpanel' });
    if (this.error) panel.append(h('p', { class: 'error', role: 'alert' }, this.error));
    if (this.tab === 'pgn') this.pgnPanel(panel);
    else if (this.tab === 'file') this.filePanel(panel);
    else this.remotePanel(panel, this.tab);
    el.append(panel);
  }

  private pgnPanel(panel: HTMLElement) {
    const ta = h('textarea', {
      class: 'pgn-input',
      placeholder: t('pgnPlaceholder'),
      spellcheck: false,
      rows: 10,
      on: { input: (e) => (this.pgnText = (e.target as HTMLTextAreaElement).value) },
    });
    ta.value = this.pgnText;
    panel.append(
      ta,
      h(
        'div',
        { class: 'row-actions' },
        h(
          'button',
          {
            class: 'btn',
            on: {
              click: () => {
                this.pgnText = SAMPLE_PGN;
                ta.value = SAMPLE_PGN;
              },
            },
          },
          t('sample'),
        ),
        h(
          'button',
          {
            class: 'btn btn-primary',
            on: {
              click: () => {
                if (!this.pgnText.trim()) return this.setError(t('errEmptyPgn'));
                // A pasted multi-game PGN: send it through the file picker flow.
                const games = summariseGames(this.pgnText);
                if (games.length > 1) {
                  this.fileGames = games;
                  this.fileName = 'PGN';
                  this.tab = 'file';
                  this.error = null;
                  return this.render();
                }
                this.onPick(this.pgnText);
              },
            },
          },
          t('analyse'),
        ),
      ),
    );
  }

  private filePanel(panel: HTMLElement) {
    const input = h('input', { type: 'file', accept: '.pgn,text/plain,application/x-chess-pgn', class: 'visually-hidden', id: 'pgn-file' });
    const load = async (file: File | undefined) => {
      if (!file) return;
      try {
        const text = await file.text();
        const games = summariseGames(text);
        this.fileName = file.name;
        this.fileGames = games;
        this.error = games.length ? null : t('errNoGamesInFile');
        if (games.length === 1 && !games[0].error) return this.onPick(games[0].pgn);
      } catch {
        this.error = t('errFileRead');
      }
      this.render();
    };
    input.addEventListener('change', () => load(input.files?.[0]));
    const drop = h(
      'label',
      { class: 'dropzone', for: 'pgn-file' },
      uiIcon('upload', 28),
      h('span', { class: 'btn btn-primary' }, t('chooseFile')),
      h('span', { class: 'muted small' }, t('dropHint')),
    );
    drop.addEventListener('dragover', (e) => {
      e.preventDefault();
      drop.classList.add('over');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      load(e.dataTransfer?.files?.[0]);
    });
    panel.append(input, drop);
    if (this.fileGames && this.fileGames.length) {
      panel.append(
        h('p', { class: 'muted' }, `${this.fileName} · ${t('gamesInFile', { n: this.fileGames.length })}`),
        h(
          'ul',
          { class: 'game-list' },
          this.fileGames.map((g) =>
            h(
              'li',
              null,
              h(
                'button',
                { class: 'game-item', disabled: !!g.error, on: { click: () => this.onPick(g.pgn) } },
                h('span', { class: 'gi-players' }, `${g.headers.white} — ${g.headers.black}`),
                h('span', { class: 'gi-result' }, g.headers.result),
                h('span', { class: 'gi-meta muted' }, [g.headers.date?.replace(/\./g, '-'), g.error ? t('brokenGame') : t('plies', { n: g.plyCount })].filter(Boolean).join(' · ')),
              ),
            ),
          ),
        ),
      );
    }
  }

  private remotePanel(panel: HTMLElement, src: 'chesscom' | 'lichess') {
    const st = this.remote[src];
    const input = h('input', {
      type: 'text',
      class: 'text-input',
      placeholder: t(src === 'chesscom' ? 'usernamePlaceholderChesscom' : 'usernamePlaceholderLichess'),
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: false,
      'aria-label': t('username'),
    });
    input.value = st.user;
    const search = async () => {
      st.user = input.value.trim();
      rememberMe(st.user);
      st.error = undefined;
      st.games = [];
      st.loading = true;
      this.error = null;
      this.render();
      try {
        if (src === 'chesscom') {
          const r = await chesscomRecent(st.user);
          st.games = r.games;
          st.archives = r.archives;
          st.used = r.used;
        } else {
          st.games = await lichessRecent(st.user, 20);
        }
      } catch (e) {
        st.error = importMessage(e, st.user);
      }
      st.loading = false;
      this.render();
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') search();
    });
    panel.append(
      h(
        'div',
        { class: 'search-row' },
        input,
        h('button', { class: 'btn btn-primary', disabled: !!st.loading, on: { click: search } }, st.loading ? t('loading') : t('findGames')),
      ),
    );
    if (st.error) panel.append(h('p', { class: 'error', role: 'alert' }, st.error));
    if (st.games.length) {
      const me = st.user.toLowerCase();
      panel.append(
        h(
          'ul',
          { class: 'game-list' },
          st.games.map((g) => {
            const meWhite = g.white.toLowerCase() === me;
            const opp = meWhite ? g.black : g.white;
            const oppElo = meWhite ? g.blackElo : g.whiteElo;
            const outcome =
              g.result === '½-½' ? 'draw' : (g.result === '1-0') === meWhite ? 'win' : 'loss';
            return h(
              'li',
              null,
              h(
                'button',
                { class: 'game-item', on: { click: () => this.onPick(g.pgn) } },
                h('span', { class: `gi-dot ${meWhite ? 'w' : 'b'}` }),
                h('span', { class: 'gi-players' }, `${t('vs')} ${opp}${oppElo ? ` (${oppElo})` : ''}`),
                h('span', { class: `gi-result ${outcome}` }, g.result),
                h('span', { class: 'gi-meta muted' }, `${fmtDate(g.endTime)} · ${g.timeControl}${g.speed ? ` · ${g.speed}` : ''}`),
              ),
            );
          }),
        ),
      );
      if (src === 'chesscom' && st.archives && st.used !== undefined && st.used < st.archives.length) {
        panel.append(
          h(
            'button',
            {
              class: 'btn',
              on: {
                click: async () => {
                  const idx = st.archives!.length - 1 - st.used!;
                  st.loading = true;
                  this.render();
                  try {
                    st.games.push(...(await chesscomMonth(st.archives![idx])));
                    st.used! += 1;
                  } catch (e) {
                    st.error = importMessage(e, st.user);
                  }
                  st.loading = false;
                  this.render();
                },
              },
            },
            t('loadMore'),
          ),
        );
      }
    }
  }
}
