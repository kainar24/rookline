/**
 * Opening book built from the lichess chess-openings list (CC0, see data/openings).
 * Every position on the way to a named line is "book"; named positions also carry their ECO name.
 * The JSON is ~90 KB gzipped, so it is loaded lazily the first time a review is built.
 */
export interface OpeningBook {
  /** True when the position (placement + side + castling) is in the book. */
  has(fen: string): boolean;
  /** "C20 King's Pawn Game: Leonardis Variation" or undefined. */
  name(fen: string): string | undefined;
}

interface BookData {
  names: Record<string, string>;
  book: string[];
}

export function bookKey(fen: string): string {
  return fen.split(' ').slice(0, 3).join(' ');
}

export function makeBook(data: BookData): OpeningBook {
  const set = new Set(data.book);
  for (const k of Object.keys(data.names)) set.add(k);
  return {
    has: (fen) => set.has(bookKey(fen)),
    name: (fen) => data.names[bookKey(fen)],
  };
}

let loading: Promise<OpeningBook> | null = null;

export function loadOpeningBook(): Promise<OpeningBook> {
  if (!loading) loading = import('./openings.json').then((m) => makeBook((m.default ?? m) as BookData));
  return loading;
}
