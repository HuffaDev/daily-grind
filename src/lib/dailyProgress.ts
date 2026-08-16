export interface DailyProgress {
  dateKey: string;
  userGrid: string[][];
  elapsedSeconds: number;
  complete: boolean;
  revealed: boolean;
}

const STORAGE_KEY = "mini-crossword-daily-progress";

function emptyGrid(size: number): string[][] {
  return Array.from({ length: size }, () => Array(size).fill(""));
}

export function emptyProgress(dateKey: string, size: number): DailyProgress {
  return { dateKey, userGrid: emptyGrid(size), elapsedSeconds: 0, complete: false, revealed: false };
}

/** Returns saved progress for `dateKey`, or a fresh empty progress if none is saved for that date. */
export function loadDailyProgress(dateKey: string, size: number): DailyProgress {
  if (typeof window === "undefined") return emptyProgress(dateKey, size);
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyProgress(dateKey, size);
    const parsed = JSON.parse(raw) as DailyProgress;
    if (parsed.dateKey !== dateKey) return emptyProgress(dateKey, size);
    return parsed;
  } catch {
    return emptyProgress(dateKey, size);
  }
}

export function saveDailyProgress(progress: DailyProgress): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}
