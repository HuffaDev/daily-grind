// A round game is a daily game played as a list of moves that can't be taken back,
// such as an aim or a guess. The client and the server replay the same pure `play`
// function over those moves, so the server never has to trust the client's score.

export interface RoundResult<Detail = unknown> {
  finished: boolean;
  /** Finished, and well enough to count as a solve on the boards. */
  solved: boolean;
  points: number;
  /** What the board shows besides points. Must not give away any answer. */
  detail: Detail;
}

export type PlayRound<Move, Detail = unknown> = (dateKey: string, moves: readonly Move[]) => RoundResult<Detail>;

export interface RoundGameView<Move> {
  moves: Move[];
  points: number;
  elapsedSeconds: number;
}

/** Whether `moves` carries on from `prefix`. */
export function movesStartWith<Move>(moves: readonly Move[], prefix: readonly Move[]): boolean {
  return prefix.length <= moves.length && prefix.every((move, i) => move === moves[i]);
}

/**
 * Picks which copy of the moves to keep. Moves are final, so a device that has
 * gone further on the same moves wins, and otherwise the server's copy does.
 */
export function reconcileMoves<Move>(local: readonly Move[], server: readonly Move[]): { moves: readonly Move[]; upload: boolean } {
  if (movesStartWith(local, server)) return { moves: local, upload: local.length > server.length };
  return { moves: server, upload: false };
}
