import { Cycle, makeSchedule, scheduleDay } from "@/platform/roundGame/schedule";
import type { RoundResult } from "@/platform/roundGame/types";
import type { FiveCluesDetail } from "../meta";
import { ALSO_KNOWN_AS, GUESSES, Kind, Puzzle, PUZZLES } from "./content";

export const CLUES_PER_PUZZLE = 5;
const POINTS_BY_CLUE = [250, 200, 150, 100, 50];
export const MAX_SCORE = POINTS_BY_CLUE[0] * 3;
export const MAX_POINTS_PER_PUZZLE = POINTS_BY_CLUE[0];
const MIN_LETTERS_TO_SUGGEST = 2;
const MAX_SUGGESTIONS = 5;

/** The order each day's puzzles appear in: one of each kind. */
export const KINDS: Kind[] = ["person", "country", "animal"];

export const QUESTION: Record<Kind, string> = {
  person: "Who is this?",
  country: "Which country is this?",
  animal: "Which animal is this?",
};

const cycles = KINDS.map((kind) => new Cycle(PUZZLES.filter((puzzle) => puzzle.kind === kind), `clues:${kind}`));
const puzzleSchedule = makeSchedule((): Puzzle[] => cycles.map((cycle) => cycle.take()));

export function dailyPuzzles(dateKey: string): Puzzle[] {
  return puzzleSchedule(scheduleDay(dateKey));
}

function normalise(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Names with a word starting with what's typed. Names that start with it come first. */
export function suggestions(kind: Kind, typed: string, exclude: readonly string[] = []): string[] {
  const query = normalise(typed);
  if (query.length < MIN_LETTERS_TO_SUGGEST) return [];
  const available = GUESSES[kind].filter((name) => !exclude.includes(name));
  const starts = available.filter((name) => normalise(name).startsWith(query));
  const inside = available.filter((name) => !starts.includes(name) && normalise(name).includes(` ${query}`));
  const known = available.filter((name) => !starts.includes(name) && !inside.includes(name) && ALSO_KNOWN_AS[name]?.some((other) => normalise(other).startsWith(query)));
  return [...starts, ...inside, ...known].slice(0, MAX_SUGGESTIONS);
}

/** What happened to one puzzle: how many clues were showing when it was solved, or null if it was missed. */
export type Outcome = { solvedOnClue: number | null };

export function puzzlePoints(outcome: Outcome): number {
  return outcome.solvedOnClue === null ? 0 : POINTS_BY_CLUE[outcome.solvedOnClue - 1];
}

/** What a right answer is worth while this many clues are showing. */
export function pointsAtClue(clue: number): number {
  return POINTS_BY_CLUE[clue - 1];
}

export function totalPoints(outcomes: readonly Outcome[]): number {
  return outcomes.reduce((sum, outcome) => sum + puzzlePoints(outcome), 0);
}

function squares(outcome: Outcome): string {
  if (outcome.solvedOnClue === null) return "🟧".repeat(CLUES_PER_PUZZLE);
  return `${"🟧".repeat(outcome.solvedOnClue - 1)}🟦`;
}

/** A guess from the list, or null for asking for the next clue without guessing. */
export type Move = string | null;

export interface PuzzleState {
  /** Clues showing, from 1 to 5. */
  shown: number;
  wrong: string[];
  /** Null while it's still being played. */
  outcome: Outcome | null;
}

/** Replays the moves over the day's puzzles, in order. A puzzle that hasn't been reached has no state yet. */
export function replay(puzzles: readonly Puzzle[], moves: readonly Move[]): PuzzleState[] {
  const states: PuzzleState[] = [{ shown: 1, wrong: [], outcome: null }];
  for (const move of moves) {
    const index = states.length - 1;
    const state = states[index];
    if (state.outcome) break;
    if (move === puzzles[index].answer) {
      state.outcome = { solvedOnClue: state.shown };
    } else {
      if (move !== null) state.wrong.push(move);
      if (state.shown === CLUES_PER_PUZZLE) state.outcome = { solvedOnClue: null };
      else state.shown += 1;
    }
    if (state.outcome && states.length < puzzles.length) states.push({ shown: 1, wrong: [], outcome: null });
  }
  return states;
}

export function playFiveClues(dateKey: string, moves: readonly Move[]): RoundResult<FiveCluesDetail> {
  const puzzles = dailyPuzzles(dateKey);
  const outcomes = replay(puzzles, moves).flatMap((state) => (state.outcome ? [state.outcome] : []));
  const finished = outcomes.length === puzzles.length;
  const found = outcomes.filter((outcome) => outcome.solvedOnClue !== null).length;
  return {
    finished,
    solved: finished && found === puzzles.length,
    points: totalPoints(outcomes),
    detail: {
      played: outcomes.length,
      found,
      total: puzzles.length,
      clues: outcomes.reduce((sum, outcome) => sum + (outcome.solvedOnClue ?? CLUES_PER_PUZZLE), 0),
    },
  };
}

const ALL_GUESSES = new Set(KINDS.flatMap((kind) => GUESSES[kind]));

export function parseGuess(value: unknown): Move | undefined {
  if (value === null) return null;
  return typeof value === "string" && ALL_GUESSES.has(value) ? value : undefined;
}

export function shareLine(puzzleNumber: number, outcomes: readonly Outcome[], url?: string): string {
  const line = `🔎 Five Clues #${puzzleNumber} ${outcomes.map(squares).join(" ")} ${totalPoints(outcomes)} pts`;
  return url ? `${line}\n\n${url}` : line;
}
