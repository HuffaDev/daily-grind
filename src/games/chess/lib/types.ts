/** The three puzzles of a day, easiest first. Each day takes one puzzle from each tier. */
export const TIERS = [
  { name: "Easy", minRating: 1000, maxRating: 1399, points: 100 },
  { name: "Medium", minRating: 1500, maxRating: 1899, points: 150 },
  { name: "Hard", minRating: 2000, maxRating: 2399, points: 200 },
] as const;

/** One Lichess puzzle. */
export interface ChessPuzzle {
  /** Lichess puzzle id: lichess.org/training/<id>. */
  id: string;
  /** The position before the opponent's setup move. */
  fen: string;
  /**
   * UCI moves, e.g. "e2e4" or "e7e8q". The first is the opponent's move that
   * sets the puzzle up; after that the player's and the opponent's alternate,
   * ending with the player's.
   */
  moves: string[];
  rating: number;
  /** N for a mate-in-N puzzle, otherwise null. */
  mateIn: number | null;
}

/** One player's progress on one puzzle. */
export interface PuzzleProgress {
  /** The player's correct moves so far, in UCI. Complete once it has one per player turn. */
  line: string[];
  /** Wrong moves tried; each costs points. */
  mistakes: number;
  /** Gave up and was shown the solution: no points for this puzzle. */
  revealed: boolean;
}

/** What the chess leaderboard rows show besides points and time. */
export interface ChessBoardDetail {
  solved: number;
  total: number;
  mistakes: number;
  revealed: number;
}
