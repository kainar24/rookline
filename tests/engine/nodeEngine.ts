import { createRequire } from 'node:module';
import { UciEngine, type UciTransport } from '../../src/engine/uciEngine';

const require = createRequire(import.meta.url);

type NodeSf = { processCommand(c: string): void; terminate(): void };
let shared: NodeSf | null = null;
let listener: (l: string) => void = () => {};

/**
 * Same lite single-threaded build as the browser, driven through the npm package's Node API.
 * The emscripten module can only be instantiated once per process, so the instance is shared;
 * `close()` (used by cancel) just detaches the listener. In Node the search runs synchronously,
 * so there is never an unfinished search to abandon.
 */
function nodeTransport(): UciTransport {
  if (!shared) {
    const init = require('stockfish') as (flavor: string, cb: (line: string) => void) => NodeSf;
    shared = init('lite-single', (line) => listener(line));
  }
  const sf = shared;
  return {
    send: (c) => sf.processCommand(c),
    onLine: (f) => (listener = f),
    close: () => {
      listener = () => {};
    },
  };
}

export function createNodeEngine(): UciEngine {
  return new UciEngine(nodeTransport);
}
