/** Two-game PGN file used by the parser tests. */
export const TWO_GAMES = `[Event "Casual"]
[Site "?"]
[Date "2024.05.01"]
[White "Alice"]
[Black "Bob"]
[Result "1-0"]
[TimeControl "600"]

1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7# 1-0

[Event "Casual"]
[Date "2024.05.02"]
[White "Bob"]
[Black "Alice"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1
`;

/** 3.Qxe5+?? gives the queen away for a pawn (Nc6 defends e5). Ply 5 must be a Blunder. */
export const QUEEN_BLUNDER = `[White "W"]
[Black "B"]
[Result "*"]

1. e4 e5 2. Qh5 Nc6 3. Qxe5+ Nxe5 *
`;

/** Legal's mate: 5...Bxd1?? (ply 10) allows mate in 2 (6.Bxf7+ Ke7 7.Nd5#). */
export const MATE_IN_TWO = `[White "W"]
[Black "B"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. Bc4 Bg4 4. Nc3 g6 5. Nxe5 Bxd1 6. Bxf7+ Ke7 7. Nd5# 1-0
`;

export const BROKEN = `[White "X"]
[Black "Y"]

1. e4 e5 2. Ke3 Qh4 3. Zz9 *
`;
