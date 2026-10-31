import { parsePuzzleId } from "@/lib/generator";
import { previousDateKey } from "@/lib/stats";
import { BoardEntry } from "./store";

/** One player's totals across every puzzle on a scope's boards. */
export interface AllTimeEntry {
  userId: string;
  name: string;
  avatarPath: string | null;
  points: number;
  played: number;
  solved: number;
  /** Past puzzles where the player topped the board with a solve. */
  wins: number;
  bestTimeSeconds: number | null;
  averageTimeSeconds: number | null;
  /** Consecutive days solved, ending today or, if today isn't solved yet, yesterday. */
  currentStreak: number;
}

/** Daily board order: points, then the faster solve, then whoever got there first. */
export function compareEntries(a: BoardEntry, b: BoardEntry): number {
  return (
    b.points - a.points ||
    (a.solvedTimeSeconds ?? Infinity) - (b.solvedTimeSeconds ?? Infinity) ||
    a.updatedAt - b.updatedAt
  );
}

/** Totals a scope's boards (keyed by puzzle id) into all-time standings as of UTC date `todayKey`. */
export function allTimeStandings(boardsByPuzzleId: Record<string, BoardEntry[]>, todayKey: string): AllTimeEntry[] {
  // A generator version bump gives one date two puzzle ids; a player's best entry for the date counts.
  const boardsByDate = new Map<string, Map<string, BoardEntry>>();
  for (const [puzzleId, entries] of Object.entries(boardsByPuzzleId)) {
    const dateKey = parsePuzzleId(puzzleId)?.dateKey;
    if (!dateKey) continue;
    let board = boardsByDate.get(dateKey);
    if (!board) boardsByDate.set(dateKey, (board = new Map()));
    for (const entry of entries) {
      const existing = board.get(entry.userId);
      if (!existing || compareEntries(entry, existing) < 0) board.set(entry.userId, entry);
    }
  }

  const players = new Map<string, { latest: BoardEntry; solvedDates: Set<string>; times: number[]; entry: AllTimeEntry }>();
  for (const [dateKey, board] of boardsByDate) {
    for (const e of board.values()) {
      let player = players.get(e.userId);
      if (!player) {
        player = {
          latest: e,
          solvedDates: new Set(),
          times: [],
          entry: {
            userId: e.userId,
            name: e.name,
            avatarPath: e.avatarPath,
            points: 0,
            played: 0,
            solved: 0,
            wins: 0,
            bestTimeSeconds: null,
            averageTimeSeconds: null,
            currentStreak: 0,
          },
        };
        players.set(e.userId, player);
      }
      if (e.updatedAt > player.latest.updatedAt) player.latest = e;
      player.entry.points += e.points;
      player.entry.played += 1;
      if (e.solvedTimeSeconds !== null) {
        player.solvedDates.add(dateKey);
        player.times.push(e.solvedTimeSeconds);
      }
    }

    // Today's board is still being played, so it has no winner yet.
    if (dateKey === todayKey) continue;
    const winner = [...board.values()].sort(compareEntries)[0];
    if (winner && winner.solvedTimeSeconds !== null) players.get(winner.userId)!.entry.wins += 1;
  }

  return [...players.values()]
    .map(({ latest, solvedDates, times, entry }) => {
      let streakDay = solvedDates.has(todayKey) ? todayKey : previousDateKey(todayKey);
      let currentStreak = 0;
      while (solvedDates.has(streakDay)) {
        currentStreak += 1;
        streakDay = previousDateKey(streakDay);
      }
      return {
        ...entry,
        // Names and avatars change; show the most recent ones.
        name: latest.name,
        avatarPath: latest.avatarPath,
        solved: times.length,
        bestTimeSeconds: times.length ? Math.min(...times) : null,
        averageTimeSeconds: times.length ? Math.round(times.reduce((sum, t) => sum + t, 0) / times.length) : null,
        currentStreak,
      };
    })
    .sort((a, b) => b.points - a.points || b.solved - a.solved || a.name.localeCompare(b.name));
}
