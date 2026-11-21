import { InfoCollector, parseBestMove } from './uci';
import type { Engine, PositionEval } from './types';
import { terminalEval } from '../analysis/terminal';

/** Minimal pipe to a UCI engine: send a command, receive output lines. */
export interface UciTransport {
  send(cmd: string): void;
  onLine(cb: (line: string) => void): void;
  /** Fatal transport errors (worker script failed to load, wasm failed to compile…). */
  onError?(cb: (message: string) => void): void;
  close(): void;
}

interface Job {
  fen: string;
  depth: number;
  collector: InfoCollector;
  resolve: (r: PositionEval) => void;
  reject: (e: Error) => void;
}

/**
 * UCI driver shared by the browser (Web Worker) and Node (tests).
 * One search at a time; `analyse` calls queue up.
 */
export class UciEngine implements Engine {
  private transport: UciTransport | null = null;
  private ready: Promise<void> | null = null;
  private waiters: Array<{ token: string; resolve: () => void }> = [];
  private job: Job | null = null;
  private queue: Array<() => void> = [];
  private multiPv = 0;
  private busy = false;
  private stopping = false;

  constructor(private factory: () => UciTransport) {}

  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.transport = this.factory();
    this.transport.onLine((l) => this.handle(l));
    let fail: (e: Error) => void = () => {};
    const failed = new Promise<never>((_, rej) => (fail = rej));
    this.transport.onError?.((msg) => {
      const err = new Error(msg);
      fail(err);
      this.job?.reject(err);
      this.job = null;
    });
    const ready = (async () => {
      await this.request('uci', 'uciok');
      await this.request('isready', 'readyok');
    })();
    this.ready = Promise.race([ready, failed]);
    this.ready.catch(() => {
      // allow a fresh attempt next time
      this.transport?.close();
      this.transport = null;
      this.ready = null;
    });
    return this.ready;
  }

  private send(cmd: string) {
    this.transport?.send(cmd);
  }

  /** Register the waiter BEFORE sending: some transports answer synchronously. */
  private request(cmd: string, token: string): Promise<void> {
    const p = new Promise<void>((resolve) => this.waiters.push({ token, resolve }));
    this.send(cmd);
    return p;
  }

  private handle(raw: string) {
    const line = String(raw).trim();
    if (!line) return;
    for (let i = 0; i < this.waiters.length; i++) {
      if (line === this.waiters[i].token || line.startsWith(this.waiters[i].token + ' ')) {
        const w = this.waiters.splice(i, 1)[0];
        w.resolve();
        return;
      }
    }
    if (!this.job) {
      // The search we stopped has finished: the engine is free again.
      if (this.stopping && line.startsWith('bestmove')) {
        this.stopping = false;
        this.busy = false;
        this.next();
      }
      return;
    }
    if (line.startsWith('info ')) {
      this.job.collector.push(line);
      return;
    }
    const bm = parseBestMove(line);
    if (bm !== undefined) {
      const job = this.job;
      this.job = null;
      const lines = job.collector.lines();
      job.resolve({
        fen: job.fen,
        depth: job.depth,
        lines,
        bestMove: bm ?? lines[0]?.pv[0] ?? null,
        terminal: false,
      });
      this.busy = false;
      this.next();
    }
  }

  private next() {
    const run = this.queue.shift();
    if (run) run();
  }

  async analyse(fen: string, depth: number, multiPv: number): Promise<PositionEval> {
    const term = terminalEval(fen, depth);
    if (term) return term;
    await this.init();
    return new Promise<PositionEval>((resolve, reject) => {
      const run = async () => {
        this.busy = true;
        if (multiPv !== this.multiPv) {
          this.send(`setoption name MultiPV value ${multiPv}`);
          this.multiPv = multiPv;
          await this.request('isready', 'readyok');
        }
        const whiteToMove = fen.split(' ')[1] !== 'b';
        this.job = { fen, depth, collector: new InfoCollector(whiteToMove), resolve, reject };
        this.send(`position fen ${fen}`);
        this.send(`go depth ${depth}`);
      };
      if (this.busy) this.queue.push(run);
      else run();
    });
  }

  /**
   * Abort the current search and drop queued work, but keep the engine alive:
   * the worker is not reloaded, so cancelling never needs the server again.
   */
  cancel(): void {
    const err = new Error('cancelled');
    this.queue = [];
    if (this.job) {
      this.job.reject(err);
      this.job = null;
      // `busy` stays true until the stopped search reports bestmove (see handle()).
      this.stopping = true;
      this.send('stop');
    }
  }

  /** Terminate the engine process. A later call re-creates it. */
  dispose(): void {
    this.job?.reject(new Error('disposed'));
    this.job = null;
    this.queue = [];
    this.busy = false;
    this.stopping = false;
    this.waiters = [];
    this.transport?.close();
    this.transport = null;
    this.ready = null;
    this.multiPv = 0;
  }
}
