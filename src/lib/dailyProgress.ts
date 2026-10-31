import { emptyScore, ScoreRecord } from "./scoring";

export interface DailyProgress {
  puzzleId: string;
  userGrid: string[][];
  elapsedSeconds: number;
  complete: boolean;
  score: ScoreRecord;
  /** Cells a Check confirmed correct; they can no longer be edited. */
  lockedCells: string[];
}

const STORAGE_KEY = "mini-crossword-daily-progress";

function emptyGrid(size: number): string[][] {
  return Array.from({ length: size }, () => Array(size).fill(""));
}

export function emptyProgress(puzzleId: string, size: number): DailyProgress {
  return { puzzleId, userGrid: emptyGrid(size), elapsedSeconds: 0, complete: false, score: emptyScore(), lockedCells: [] };
}

/** Returns saved progress for `puzzleId`, or a fresh empty progress if none is saved for that puzzle. */
export function loadDailyProgress(puzzleId: string, size: number): DailyProgress {
  if (typeof window === "undefined") return emptyProgress(puzzleId, size);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress(puzzleId, size);
    const parsed = JSON.parse(raw) as Partial<DailyProgress> & { dateKey?: string; revealed?: boolean };
    // Saves from before puzzle versioning stored only the date; those were all version 1.
    const savedId = parsed.puzzleId ?? (parsed.dateKey ? `${parsed.dateKey}.v1` : null);
    if (savedId !== puzzleId) return emptyProgress(puzzleId, size);
    return {
      puzzleId,
      userGrid: parsed.userGrid ?? emptyGrid(size),
      elapsedSeconds: parsed.elapsedSeconds ?? 0,
      complete: parsed.complete ?? false,
      score: parsed.score ?? { ...emptyScore(), revealed: parsed.revealed ?? false },
      lockedCells: parsed.lockedCells ?? [],
    };
  } catch {
    return emptyProgress(puzzleId, size);
  }
}

export function saveDailyProgress(progress: DailyProgress): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // Storage can be unavailable (private mode, blocked in some embeds); play continues unsaved.
  }
}
