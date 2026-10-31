import { DayRecord, emptyDay } from "./scoring";

export interface DailyProgress {
  puzzleId: string;
  day: DayRecord;
  elapsedSeconds: number;
}

const STORAGE_KEY = "daily-grind:chess:progress";

/** Returns saved progress for `puzzleId`, or a fresh one if none is saved for that puzzle. */
export function loadDailyProgress(puzzleId: string, count: number): DailyProgress {
  const fresh = { puzzleId, day: emptyDay(count), elapsedSeconds: 0 };
  if (typeof window === "undefined") return fresh;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fresh;
    const parsed = JSON.parse(raw) as Partial<DailyProgress>;
    if (parsed.puzzleId !== puzzleId || parsed.day?.puzzles.length !== count) return fresh;
    return { puzzleId, day: parsed.day, elapsedSeconds: parsed.elapsedSeconds ?? 0 };
  } catch {
    return fresh;
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
