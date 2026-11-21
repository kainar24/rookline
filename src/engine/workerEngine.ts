import { UciEngine, type UciTransport } from './uciEngine';

/** URL of the same-origin Stockfish worker (copied into public/engine by scripts/copy-engine.mjs). */
export function engineUrl(): string {
  return new URL('engine/stockfish-19-lite-single.js', new URL(import.meta.env.BASE_URL, location.href)).href;
}

function workerTransport(): UciTransport {
  const url = engineUrl();
  let cb: (l: string) => void = () => {};
  let errCb: (m: string) => void = () => {};
  let worker: Worker;
  try {
    worker = new Worker(url);
  } catch (e) {
    const msg = `cannot start worker ${url}: ${(e as Error).message}`;
    setTimeout(() => errCb(msg));
    return { send: () => {}, onLine: (f) => (cb = f), onError: (f) => (errCb = f), close: () => {} };
  }
  worker.onmessage = (e: MessageEvent) => {
    const data = typeof e.data === 'string' ? e.data : String(e.data);
    for (const l of data.split('\n')) {
      // Emscripten reports fatal wasm problems as plain output lines.
      if (/^(Aborted\(|RuntimeError|CompileError|LinkError)/.test(l)) errCb(l);
      cb(l);
    }
  };
  worker.onerror = (e) => {
    e.preventDefault?.();
    const msg = e.message || `worker failed to load (${url})`;
    console.error('[engine]', msg);
    errCb(msg);
  };
  worker.onmessageerror = () => errCb('worker message error');
  return {
    send: (c) => worker.postMessage(c),
    onLine: (f) => (cb = f),
    onError: (f) => (errCb = f),
    close: () => worker.terminate(),
  };
}

/** Browser engine: Stockfish runs in a Web Worker, so the UI never blocks. */
export function createWorkerEngine(): UciEngine {
  return new UciEngine(workerTransport);
}
