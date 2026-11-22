// Builds src/analysis/openings.json from the lichess chess-openings TSV files (CC0, data/openings).
// Every position on the way to a named line counts as "book"; named positions also carry their name.
// Run: node scripts/build-openings.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'data', 'openings');
/** Position key: placement + side to move + castling (en passant ignored, like most books). */
const key = (fen) => fen.split(' ').slice(0, 3).join(' ');

const names = {};
const book = new Set();
for (const f of readdirSync(dir).filter((f) => f.endsWith('.tsv')).sort()) {
  const rows = readFileSync(join(dir, f), 'utf8').trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const c = new Chess();
    const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
    for (const san of sans) {
      c.move(san);
      book.add(key(c.fen()));
    }
    names[key(c.fen())] = `${eco} ${name}`;
  }
}
// Named positions are stored with their name; the rest only as book markers.
const out = { names, book: [...book].filter((k) => !(k in names)).sort() };
writeFileSync(join(root, 'src', 'analysis', 'openings.json'), JSON.stringify(out));
console.log(`[openings] ${Object.keys(names).length} named + ${out.book.length} book positions`);
