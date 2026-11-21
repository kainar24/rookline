// Copies the single-threaded lite Stockfish build from node_modules into public/engine
// so the worker is served from the same origin as the app.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules', 'stockfish', 'bin');
const dst = join(root, 'public', 'engine');
mkdirSync(dst, { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  const from = join(src, f);
  if (!existsSync(from)) {
    console.error(`[copy-engine] missing ${from}. Run npm install first.`);
    process.exit(1);
  }
  copyFileSync(from, join(dst, f));
}
copyFileSync(join(root, 'node_modules', 'stockfish', 'Copying.txt'), join(dst, 'COPYING.txt'));
console.log('[copy-engine] Stockfish lite single-threaded copied to public/engine');
