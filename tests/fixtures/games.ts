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

/**
 * A public chess.com rapid game (2026-11-22) whose published accuracies are 65.84 / 75.3.
 * Player names removed; Elo kept because the game rating uses it.
 */
export const CHESSCOM_RAPID = `[White "White"]
[Black "Black"]
[Result "0-1"]
[WhiteElo "789"]
[BlackElo "825"]

1. d3 e5 2. e4 Nf6 3. f4 Nc6 4. f5 Bc5 5. Nf3 d5 6. Nc3 d4 7. Ne2 Ng4 8. h3 Ne3 9. Bxe3 dxe3 10. g4 Nd4 11. Nexd4 Bxd4 12. c3 Bb6 13. d4 exd4 14. cxd4 Bxd4 15. Nxd4 c5 16. Bb5+ Bd7 17. Nf3 Bxb5 18. Qxd8+ Rxd8 19. Rd1 Rxd1+ 20. Kxd1 e2+ 21. Kc2 O-O 22. g5 Rd8 23. g6 fxg6 24. fxg6 h6 25. b3 c4 26. a4 cxb3+ 27. Kxb3 Rd1 28. Rxd1 exd1=Q+ 29. Kb4 Qxa4+ 30. Kc5 Qc4+ 31. Kd6 Qd3+ 32. Ke5 Qxf3 33. Ke6 Qxe4+ 34. Kd6 Qxg6+ 35. Kc5 Qc6+ 36. Kb4 Qc4+ 37. Ka5 b6# 0-1`;
export const CHESSCOM_RAPID_ACCURACY = { w: 65.84, b: 75.3 };
