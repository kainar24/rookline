import './styles.css';
import { analysePositions, CancelledError } from './analysis/analyzer';
import { reviewGame } from './analysis/classify';
import { CONFIG } from './analysis/config';
import { loadOpeningBook } from './analysis/openings';
import { cacheKey, loadCached, saveCached } from './cache/idbCache';
import { createWorkerEngine } from './engine/workerEngine';
import type { UciEngine } from './engine/uciEngine';
import { getLang, onLangChange, setLang, t } from './i18n/i18n';
import { hashGame, parseGame, PgnError, type ParsedGame } from './pgn/pgn';
import { applyTheme, effectiveTheme, loadSettings, saveSettings, type Settings } from './settings';
import { clear, h, svgFromString } from './ui/dom';
import { avatar, BRAND_MARK, uiIcon } from './ui/icons';
import { InputView, SAMPLE_PGN } from './ui/input';
import { ReportView } from './ui/report';
import { openSettingsDialog } from './ui/settingsDialog';

let settings: Settings = loadSettings();
setLang(settings.lang);
applyTheme(settings.theme);

const app = document.getElementById('app')!;
const rail = h('nav', { class: 'rail' });
const main = h('main', { class: 'main' });
const footer = h('footer', { class: 'footer' });
app.append(rail, h('div', { class: 'content' }, main, footer));

let engine: UciEngine | null = null;
let engineInit: Promise<void> | null = null;
let inputView: InputView | null = null;
let report: ReportView | null = null;
let screen: 'input' | 'analysing' | 'report' = 'input';
let abort: AbortController | null = null;

/**
 * Start (or reuse) the engine. It is created as soon as the page opens, so the worker and its
 * wasm are already in memory when a game is picked — even if the local server stops later.
 */
function warmEngine(): Promise<void> {
  if (!engine) engine = createWorkerEngine();
  if (!engineInit) {
    engineInit = withTimeout(engine.init(), 30_000, 'timeout');
    engineInit.catch(() => {
      engine?.dispose();
      engine = null;
      engineInit = null;
    });
  }
  return engineInit;
}

function updateSettings(next: Settings) {
  const langChanged = next.lang !== settings.lang;
  settings = next;
  saveSettings(settings);
  applyTheme(settings.theme);
  if (langChanged) setLang(settings.lang);
  else rerenderChrome();
  report?.rerender();
}

function rerenderChrome() {
  clear(rail);
  const dark = effectiveTheme(settings.theme) === 'dark';
  const item = (icon: Node, label: string, fn: () => void, extra = '') =>
    h('button', { class: `rail-item ${extra}`, title: label, 'aria-label': label, on: { click: fn } }, icon, h('span', { class: 'rail-label' }, label));
  rail.append(
    h('button', { class: 'rail-brand', title: t('newGame'), on: { click: () => showInput() } }, svgFromString(BRAND_MARK), h('span', { class: 'rail-label brand-word' }, 'Rook', h('span', { class: 'brand-line' }, 'line'))),
    item(uiIcon('plus', 22), t('newGameShort'), () => showInput(), screen === 'input' ? 'active' : ''),
    item(uiIcon('star', 22), t('gameReview'), () => undefined, screen === 'report' ? 'active' : 'disabled'),
    h('span', { class: 'rail-spacer' }),
    item(h('span', { class: 'rail-lang' }, getLang() === 'ru' ? 'EN' : 'RU'), t('langToggle'), () => updateSettings({ ...settings, lang: getLang() === 'ru' ? 'en' : 'ru' })),
    item(uiIcon(dark ? 'sun' : 'moon', 22), t('themeToggle'), () => updateSettings({ ...settings, theme: dark ? 'light' : 'dark' })),
    item(uiIcon('gear', 22), t('settings'), openSettings),
  );
  footer.textContent = `Stockfish 19 (GPLv3) · pieces: cburnett (GPLv2+) · ${t('depthLabel', { d: settings.depth })}`;
}

function openSettings() {
  openSettingsDialog(settings, updateSettings);
}

function showInput(error: string | null = null) {
  abort?.abort();
  report?.destroy();
  report = null;
  screen = 'input';
  document.body.dataset.screen = 'input';
  rerenderChrome();
  clear(main);
  if (!inputView) inputView = new InputView(startAnalysis, error);
  else inputView.setError(error);
  main.append(inputView.el);
}

function pgnErrorText(e: unknown): string {
  if (e instanceof PgnError) {
    if (e.code === 'empty') return t('errEmptyPgn');
    if (e.code === 'no-moves') return t('errNoMoves');
    return t('errInvalidPgn', { msg: e.message });
  }
  return t('errInvalidPgn', { msg: String((e as Error)?.message ?? e) });
}

function withTimeout<T>(p: Promise<T>, ms: number, msg: string): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

async function startAnalysis(pgn: string) {
  let game: ParsedGame;
  try {
    game = parseGame(pgn);
  } catch (e) {
    return showInput(pgnErrorText(e));
  }
  const depth = settings.depth;
  const key = cacheKey(await hashGame(game), depth);
  const cached = await loadCached(key);
  if (cached && cached.length === game.fens.length) return showReport(game, reviewGame(game, cached, { book: await bookOrNone() }));
  if (location.protocol === 'file:') return showInput(t('errFileProtocol'));

  screen = 'analysing';
  document.body.dataset.screen = 'analysing';
  rerenderChrome();
  clear(main);
  const bar = h('div', { class: 'progress-fill' });
  const label = h('div', { class: 'progress-label' }, t('engineLoading'));
  abort = new AbortController();
  const ac = abort;
  main.append(
    h(
      'section',
      { class: 'analysing' },
      h('div', { class: 'coach' }, avatar('coach', 48), h('div', { class: 'bubble' }, h('strong', null, t('analysing')), h('p', null, `${game.headers.white} — ${game.headers.black} · ${t('depthLabel', { d: depth })}`))),
      h('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, bar),
      label,
      h('button', { class: 'btn btn-dark btn-lg', on: { click: () => ac.abort() } }, t('cancel')),
    ),
  );
  try {
    await warmEngine();
    const evals = await analysePositions(game, engine!, {
      depth,
      multiPv: CONFIG.multiPv,
      signal: ac.signal,
      onProgress: (done, total) => {
        const pct = Math.round((done / total) * 100);
        bar.style.width = `${pct}%`;
        bar.parentElement?.setAttribute('aria-valuenow', String(pct));
        label.textContent = t('progress', { done, total });
      },
    });
    await saveCached(key, evals);
    showReport(game, reviewGame(game, evals, { book: await bookOrNone() }));
  } catch (e) {
    if (e instanceof CancelledError || ac.signal.aborted) {
      if (screen === 'analysing') showInput(t('cancelled'));
      return;
    }
    console.error('[analysis]', e);
    engine?.dispose();
    engine = null;
    engineInit = null;
    showInput(`${t('errEngineLoad')} (${(e as Error).message})`);
  }
}

/** The opening book is optional: if it fails to load, "Book" falls back to the early-ply rule. */
async function bookOrNone() {
  try {
    return await loadOpeningBook();
  } catch (e) {
    console.warn('[openings]', e);
    return undefined;
  }
}

function showReport(game: ParsedGame, review: ReturnType<typeof reviewGame>) {
  screen = 'report';
  document.body.dataset.screen = 'report';
  rerenderChrome();
  clear(main);
  report?.destroy();
  report = new ReportView(game, review, () => settings, openSettings);
  main.append(report.el);
  window.scrollTo({ top: 0 });
}

onLangChange(() => {
  rerenderChrome();
  if (screen === 'input') inputView?.render();
  report?.rerender();
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => rerenderChrome());

showInput(location.protocol === 'file:' ? t('errFileProtocol') : null);
// Load the engine right away (in the background) so it is ready before a game is picked.
if (location.protocol !== 'file:') warmEngine().catch(() => undefined);

// Test hooks: ?pgn=<urlencoded> or #sample starts a review right away.
const params = new URLSearchParams(location.search);
if (params.get('pgn')) startAnalysis(params.get('pgn')!);
else if (location.hash === '#sample') startAnalysis(SAMPLE_PGN);
