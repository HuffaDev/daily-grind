import { mulberry32, seedForDateKey } from "@/platform/daily";
import type { StepRules } from "@/platform/stepGame/rules";

// Daily Heist: sneak through a small map, grab the loot and reach the exit
// without a guard seeing you. Each turn you step or wait, then every guard
// steps along its patrol, pacing back and forth. A guard sees its own square
// and up to VISION squares ahead, until a wall. Moves are "U", "D", "L", "R"
// and "W" (wait). Pure: the server and the browser simulate turns the same way.

export const SIZE = 7;
export const VISION = 2;

export type Cell = [number, number];

export interface HeistPuzzle {
  /** SIZE rows of SIZE characters: "#" for a wall, "." for floor. */
  map: string[];
  start: Cell;
  loot: Cell;
  exit: Cell;
  /** Each guard's patrol: the squares it walks, end to end and back. */
  guards: Cell[][];
  /** Fewest turns that pull the job off. */
  par: number;
}

export const MOVES: Record<string, Cell> = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1], W: [0, 0] };

const same = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];
const isFloor = (map: string[], [r, c]: Cell) => r >= 0 && r < SIZE && c >= 0 && c < SIZE && map[r][c] !== "#";

/** Where a guard stands at `turn`, pacing its route back and forth. */
export function guardAt(route: Cell[], turn: number): Cell {
  if (route.length === 1) return route[0];
  const period = 2 * (route.length - 1);
  const step = turn % period;
  return route[step < route.length ? step : period - step];
}

/** The squares a guard can see at `turn`: its own, and ahead the way it will step next. */
export function guardSight(map: string[], route: Cell[], turn: number): Cell[] {
  const here = guardAt(route, turn);
  const next = guardAt(route, turn + 1);
  const dir: Cell = [Math.sign(next[0] - here[0]), Math.sign(next[1] - here[1])];
  const seen: Cell[] = [here];
  if (dir[0] === 0 && dir[1] === 0) return seen;
  let cell = here;
  for (let i = 0; i < VISION; i++) {
    cell = [cell[0] + dir[0], cell[1] + dir[1]];
    if (!isFloor(map, cell)) break;
    seen.push(cell);
  }
  return seen;
}

/** Whether a player who just went from `from` to `to` on `turn` gets caught. */
function caught(puzzle: HeistPuzzle, from: Cell, to: Cell, turn: number): boolean {
  return puzzle.guards.some((route) => {
    // Walking through each other counts, as well as being seen.
    if (same(guardAt(route, turn), from) && same(guardAt(route, turn - 1), to)) return true;
    return guardSight(puzzle.map, route, turn).some((cell) => same(cell, to));
  });
}

export interface HeistState {
  at: Cell;
  looted: boolean;
  turn: number;
}

/** The state after `moves`, which must all be playable. */
export function stateAfter(puzzle: HeistPuzzle, moves: readonly string[]): HeistState {
  let state: HeistState = { at: puzzle.start, looted: false, turn: 0 };
  for (const move of moves) state = step(puzzle, state, move).state;
  return state;
}

/** One turn: the player's move, then the guards'. */
function step(puzzle: HeistPuzzle, state: HeistState, move: string): { state: HeistState; error: string | null } {
  const dir = MOVES[move];
  if (!dir) return { state, error: "Unknown move" };
  const to: Cell = [state.at[0] + dir[0], state.at[1] + dir[1]];
  if (!isFloor(puzzle.map, to)) return { state, error: "There's a wall there" };
  const next = { at: to, looted: state.looted || same(to, puzzle.loot), turn: state.turn + 1 };
  if (caught(puzzle, state.at, to, next.turn)) return { state: next, error: "A guard would spot you" };
  return { state: next, error: null };
}

const solvedState = (puzzle: HeistPuzzle, state: HeistState) => state.looted && same(state.at, puzzle.exit);

export const HEIST_RULES: StepRules<HeistPuzzle> = {
  invalidMove: (puzzle, moves, move) => step(puzzle, stateAfter(puzzle, moves), move).error,
  isSolved: (puzzle, moves) => solvedState(puzzle, stateAfter(puzzle, moves)),
  progress(puzzle, moves) {
    const state = stateAfter(puzzle, moves);
    return { done: Number(state.looted) + Number(solvedState(puzzle, state)), total: 2 };
  },
  skillPoints(puzzle, moves) {
    const over = moves.length - puzzle.par;
    return over > 0 ? -Math.min(200, 15 * over) : 0;
  },
  skillLabel: "Turns over par",
  giveUpPoints: (puzzle, moves) => (stateAfter(puzzle, moves).looted ? 50 : 0),
  maxMoves: 150,
  scoring: { solvePoints: 400, timeBonusMax: 200, timeBonusWindowSeconds: 300 },
};

/**
 * The fewest moves that pull the job off, or null if there's no way. With
 * `ignoreGuards`, the shortest walk as if no one were watching.
 */
export function solve(puzzle: HeistPuzzle, ignoreGuards = false): string[] | null {
  const lcm = (a: number, b: number): number => {
    const gcd = (x: number, y: number): number => (y ? gcd(y, x % y) : x);
    return (a * b) / gcd(a, b);
  };
  // Guards repeat every period, so a state is the square, the loot, and the turn within that cycle.
  const period = ignoreGuards ? 1 : puzzle.guards.reduce((p, route) => lcm(p, Math.max(1, 2 * (route.length - 1))), 1);
  const watched = ignoreGuards ? { ...puzzle, guards: [] } : puzzle;
  const keyOf = (s: HeistState) => `${s.at[0]},${s.at[1]},${s.looted ? 1 : 0},${s.turn % period}`;
  const start: HeistState = { at: puzzle.start, looted: false, turn: 0 };
  const seen = new Map<string, { from: string | null; move: string | null; state: HeistState }>([
    [keyOf(start), { from: null, move: null, state: start }],
  ]);
  const queue = [keyOf(start)];
  for (let i = 0; i < queue.length; i++) {
    const k = queue[i];
    const { state } = seen.get(k)!;
    if (solvedState(puzzle, state)) {
      const moves: string[] = [];
      for (let at: string | null = k; seen.get(at!)!.move; at = seen.get(at!)!.from) moves.unshift(seen.get(at!)!.move!);
      return moves;
    }
    for (const move of Object.keys(MOVES)) {
      const result = step(watched, state, move);
      if (result.error) continue;
      const nk = keyOf(result.state);
      if (seen.has(nk)) continue;
      seen.set(nk, { from: k, move, state: result.state });
      queue.push(nk);
    }
  }
  return null;
}

/** Guards by weekday, Sunday first. */
const GUARDS_BY_WEEKDAY = [3, 2, 2, 2, 3, 3, 3];
const WALL_CHANCE = 0.22;
const MIN_PAR = 12;

function floorCells(map: string[]): Cell[] {
  const cells: Cell[] = [];
  for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (map[r][c] !== "#") cells.push([r, c]);
  return cells;
}

/** Walking distances from `from` to every floor square. */
function distances(map: string[], from: Cell): Map<string, number> {
  const dist = new Map([[`${from[0]},${from[1]}`, 0]]);
  const queue: Cell[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i];
    for (const [dr, dc] of Object.values(MOVES)) {
      const next: Cell = [r + dr, c + dc];
      const k = `${next[0]},${next[1]}`;
      if (!isFloor(map, next) || dist.has(k)) continue;
      dist.set(k, dist.get(`${r},${c}`)! + 1);
      queue.push(next);
    }
  }
  return dist;
}

/** One attempt at a day's map; null when it doesn't make a fair, interesting job. */
function attempt(random: () => number, guardCount: number): { puzzle: HeistPuzzle; solution: string[] } | null {
  const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
  const map = Array.from({ length: SIZE }, () =>
    Array.from({ length: SIZE }, () => (random() < WALL_CHANCE ? "#" : ".")).join("")
  );
  const floor = floorCells(map);
  // Start on the left edge, exit on the right, loot as far from both as the map allows.
  const start = pick(floor.filter(([, c]) => c === 0));
  const exit = pick(floor.filter(([, c]) => c === SIZE - 1));
  if (!start || !exit) return null;
  const fromStart = distances(map, start);
  const fromExit = distances(map, exit);
  if (!fromStart.has(`${exit[0]},${exit[1]}`) || fromStart.size < floor.length * 0.8) return null;
  const reachable = floor.filter(([r, c]) => fromStart.has(`${r},${c}`));
  const away = ([r, c]: Cell) => Math.min(fromStart.get(`${r},${c}`)!, fromExit.get(`${r},${c}`)!);
  const loot = reachable.reduce((best, cell) => (away(cell) > away(best) ? cell : best));

  // Guards pace straight corridors of 2–4 squares, never over the start.
  const guards: Cell[][] = [];
  for (let tries = 0; guards.length < guardCount && tries < 50; tries++) {
    const from = pick(reachable);
    const [dr, dc] = pick([MOVES.U, MOVES.D, MOVES.L, MOVES.R]);
    const route: Cell[] = [from];
    const length = 2 + Math.floor(random() * 3);
    while (route.length < length) {
      const last = route.at(-1)!;
      const next: Cell = [last[0] + dr, last[1] + dc];
      if (!isFloor(map, next)) break;
      route.push(next);
    }
    if (route.length < 2 || route.some((cell) => same(cell, start) || same(cell, loot) || same(cell, exit))) continue;
    guards.push(route);
  }
  if (guards.length < guardCount) return null;
  if (guards.some((route) => guardSight(map, route, 0).some((cell) => same(cell, start)))) return null;

  const puzzle: HeistPuzzle = { map, start, loot, exit, guards, par: 0 };
  const solution = solve(puzzle);
  const unguarded = solve(puzzle, true);
  // The guards have to matter: the best route must be longer than simply walking it.
  if (!solution || !unguarded || solution.length < MIN_PAR || solution.length <= unguarded.length) return null;
  return { puzzle: { ...puzzle, par: solution.length }, solution };
}

/** The day's heist, and a par route through it. */
export function generateDailyHeist(dateKey: string): { puzzle: HeistPuzzle; solution: string[] } {
  const random = mulberry32(seedForDateKey(dateKey));
  const [y, m, d] = dateKey.split("-").map(Number);
  const guardCount = GUARDS_BY_WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  for (;;) {
    const day = attempt(random, guardCount);
    if (day) return day;
  }
}
