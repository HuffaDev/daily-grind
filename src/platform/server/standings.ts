import { parsePuzzleId, previousDateKey } from "@/platform/daily";
import { BoardEntry } from "./store";

interface PlayerSummary {
  userId: string;
  name: string;
  avatarPath: string | null;
  points: number;
  played: number;
  solved: number;
  /** Past puzzles where the player topped the board with a solve. */
  wins: number;
  /** Consecutive days solved, ending today or, if today isn't solved yet, yesterday. */
  currentStreak: number;
}

/** One player's totals across every puzzle of one game on a scope's boards. */
export interface AllTimeEntry extends PlayerSummary {
  bestTimeSeconds: number | null;
  averageTimeSeconds: number | null;
}

/**
 * One player's totals across every game. A day counts toward the streak when
 * the player solved at least one game that day.
 */
export interface GlobalEntry extends PlayerSummary {
  /** Points per game id, for games the player has played. */
  gamePoints: Record<string, number>;
}

/** Daily board order: points, then the faster solve, then whoever got there first. */
export function compareEntries(a: BoardEntry, b: BoardEntry): number {
  return (
    b.points - a.points ||
    (a.solvedTimeSeconds ?? Infinity) - (b.solvedTimeSeconds ?? Infinity) ||
    a.updatedAt - b.updatedAt
  );
}

interface Tally {
  /** The player's most recent entry, for their current name and avatar. */
  latest: BoardEntry;
  points: number;
  played: number;
  wins: number;
  solvedDates: Set<string>;
  times: number[];
}

/**
 * Regroups boards keyed by puzzle id into one board per date. A puzzle version
 * bump gives one date two puzzle ids; a player's best entry for the date counts.
 */
function boardsByDate(boardsByPuzzleId: Record<string, BoardEntry[]>): Map<string, Map<string, BoardEntry>> {
  const byDate = new Map<string, Map<string, BoardEntry>>();
  for (const [puzzleId, entries] of Object.entries(boardsByPuzzleId)) {
    const dateKey = parsePuzzleId(puzzleId)?.dateKey;
    if (!dateKey) continue;
    const board = byDate.get(dateKey) ?? new Map<string, BoardEntry>();
    byDate.set(dateKey, board);
    for (const entry of entries) {
      const existing = board.get(entry.userId);
      if (!existing || compareEntries(entry, existing) < 0) board.set(entry.userId, entry);
    }
  }
  return byDate;
}

/** Totals one game's boards (keyed by puzzle id) per player, as of UTC date `todayKey`. */
function tally(boardsByPuzzleId: Record<string, BoardEntry[]>, todayKey: string): Map<string, Tally> {
  const players = new Map<string, Tally>();
  for (const [dateKey, board] of boardsByDate(boardsByPuzzleId)) {
    for (const e of board.values()) {
      let player = players.get(e.userId);
      if (!player) {
        player = { latest: e, points: 0, played: 0, wins: 0, solvedDates: new Set(), times: [] };
        players.set(e.userId, player);
      }
      if (e.updatedAt > player.latest.updatedAt) player.latest = e;
      player.points += e.points;
      player.played += 1;
      if (e.solvedTimeSeconds !== null) {
        player.solvedDates.add(dateKey);
        player.times.push(e.solvedTimeSeconds);
      }
    }

    // Today's board is still being played, so it has no winner yet.
    if (dateKey === todayKey) continue;
    const winner = [...board.values()].sort(compareEntries)[0];
    if (winner && winner.solvedTimeSeconds !== null) players.get(winner.userId)!.wins += 1;
  }
  return players;
}

function currentStreak(solvedDates: Set<string>, todayKey: string): number {
  let day = solvedDates.has(todayKey) ? todayKey : previousDateKey(todayKey);
  let streak = 0;
  while (solvedDates.has(day)) {
    streak += 1;
    day = previousDateKey(day);
  }
  return streak;
}

const byStanding = (a: PlayerSummary, b: PlayerSummary) =>
  b.points - a.points || b.solved - a.solved || a.name.localeCompare(b.name);

/** Totals a scope's boards for one game (keyed by puzzle id) into all-time standings as of UTC date `todayKey`. */
export function allTimeStandings(boardsByPuzzleId: Record<string, BoardEntry[]>, todayKey: string): AllTimeEntry[] {
  return [...tally(boardsByPuzzleId, todayKey).values()]
    .map(({ latest, points, played, wins, solvedDates, times }) => ({
      userId: latest.userId,
      // Names and avatars change; show the most recent ones.
      name: latest.name,
      avatarPath: latest.avatarPath,
      points,
      played,
      solved: times.length,
      wins,
      bestTimeSeconds: times.length ? Math.min(...times) : null,
      averageTimeSeconds: times.length ? Math.round(times.reduce((sum, t) => sum + t, 0) / times.length) : null,
      currentStreak: currentStreak(solvedDates, todayKey),
    }))
    .sort(byStanding);
}

/** Combines a scope's boards for every game (game id → puzzle id → entries) into standings across games. */
export function globalStandings(
  boardsByGame: Record<string, Record<string, BoardEntry[]>>,
  todayKey: string
): GlobalEntry[] {
  const players = new Map<string, { latest: BoardEntry; solvedDates: Set<string>; entry: GlobalEntry }>();
  for (const [gameId, boards] of Object.entries(boardsByGame)) {
    for (const t of tally(boards, todayKey).values()) {
      let player = players.get(t.latest.userId);
      if (!player) {
        player = {
          latest: t.latest,
          solvedDates: new Set(),
          entry: {
            userId: t.latest.userId,
            name: t.latest.name,
            avatarPath: t.latest.avatarPath,
            points: 0,
            played: 0,
            solved: 0,
            wins: 0,
            currentStreak: 0,
            gamePoints: {},
          },
        };
        players.set(t.latest.userId, player);
      }
      if (t.latest.updatedAt > player.latest.updatedAt) player.latest = t.latest;
      player.entry.points += t.points;
      player.entry.played += t.played;
      player.entry.solved += t.times.length;
      player.entry.wins += t.wins;
      player.entry.gamePoints[gameId] = t.points;
      for (const dateKey of t.solvedDates) player.solvedDates.add(dateKey);
    }
  }

  return [...players.values()]
    .map(({ latest, solvedDates, entry }) => ({
      ...entry,
      name: latest.name,
      avatarPath: latest.avatarPath,
      currentStreak: currentStreak(solvedDates, todayKey),
    }))
    .sort(byStanding);
}
