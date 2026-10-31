import { describe, expect, it } from "bun:test";
import { Chess } from "chess.js";
import { getDailyPuzzles } from "./puzzles";
import { isSolved, judgeMove, playerColor, playerMoveCount, playUci, sequence, solutionText, validLine } from "./solution";
import { ChessPuzzle } from "./types";
import bank from "../data/puzzles.json";

// From the bank: White's setup move Rb2, then Black wins the rook with a skewer.
const skewer: ChessPuzzle = {
  id: "UnBrP",
  fen: "7r/8/1Pk2p2/1R2p3/P3p3/4P3/3K4/8 w - - 3 44",
  moves: ["b5b2", "h8h2", "d2c3", "h2b2", "c3b2", "c6b6"],
  rating: 1284,
  mateIn: null,
};

// Black's setup move Kh8 walks into a back-rank mate that either rook gives.
const backRank: ChessPuzzle = {
  id: "test",
  fen: "6k1/5ppp/8/8/8/8/8/RR4K1 b - - 0 1",
  moves: ["g8h8", "a1a8"],
  rating: 1000,
  mateIn: 1,
};

describe("judgeMove", () => {
  it("plays the player's side after the setup move", () => {
    expect(playerColor(skewer)).toBe("black");
    expect(playerColor(backRank)).toBe("white");
    expect(playerMoveCount(skewer)).toBe(3);
  });

  it("accepts the solution move by move", () => {
    expect(judgeMove(skewer, [], "h8h2")).toBe("correct");
    expect(judgeMove(skewer, ["h8h2"], "h2b2")).toBe("correct");
    expect(judgeMove(skewer, ["h8h2", "h2b2"], "c6b6")).toBe("solved");
  });

  it("tells wrong moves from illegal ones", () => {
    expect(judgeMove(skewer, [], "h8h7")).toBe("wrong");
    expect(judgeMove(skewer, [], "h8a1")).toBe("illegal");
  });

  it("accepts any checkmate, not just the listed one", () => {
    expect(judgeMove(backRank, [], "a1a8")).toBe("solved");
    expect(judgeMove(backRank, [], "b1b8")).toBe("solved");
    expect(isSolved(backRank, ["b1b8"])).toBe(true);
  });
});

describe("validLine", () => {
  it("keeps only the correct start of a line", () => {
    expect(validLine(skewer, ["h8h2", "h2h1", "c6b6"])).toEqual(["h8h2"]);
    expect(validLine(skewer, ["h8h2", "h2b2", "c6b6", "b6b5"])).toEqual(["h8h2", "h2b2", "c6b6"]);
    expect(validLine(skewer, ["nonsense"])).toEqual([]);
  });
});

describe("sequence", () => {
  it("interleaves the opponent's replies, with none after the last move", () => {
    expect(sequence(skewer, [])).toEqual(["b5b2"]);
    expect(sequence(skewer, ["h8h2"])).toEqual(["b5b2", "h8h2", "d2c3"]);
    expect(sequence(skewer, ["h8h2", "h2b2", "c6b6"])).toEqual(skewer.moves);
  });

  it("writes the solution in numbered SAN", () => {
    expect(solutionText(skewer)).toBe("44… Rh2+ 45. Kc3 Rxb2 46. Kxb2 Kxb6");
    expect(solutionText(backRank)).toBe("2. Ra8#");
  });
});

describe("puzzle bank", () => {
  it("draws one puzzle per tier, easiest first", () => {
    const puzzles = getDailyPuzzles("2026-10-31");
    expect(puzzles).toHaveLength(3);
    expect(puzzles[0].rating).toBeLessThan(puzzles[1].rating);
    expect(puzzles[1].rating).toBeLessThan(puzzles[2].rating);
    expect(getDailyPuzzles("2026-11-01")[0].id).not.toBe(puzzles[0].id);
  });

  // A sample: the whole bank takes seconds. The build script checks every move is legal.
  it("only holds puzzles whose solution plays out and is accepted", () => {
    for (const tier of bank as string[][]) {
      for (const row of tier.filter((_, i) => i % 20 === 0)) {
        const [id, fen, moves] = row.split(",");
        const puzzle: ChessPuzzle = { id, fen, moves: moves.split(" "), rating: 0, mateIn: null };
        const chess = new Chess(fen);
        expect(puzzle.moves.every((uci) => playUci(chess, uci))).toBe(true);
        const line = puzzle.moves.filter((_, i) => i % 2 === 1);
        expect(isSolved(puzzle, validLine(puzzle, line))).toBe(true);
      }
    }
  });
});
