export interface Stats {
  gamesPlayed: number;
  gamesWon: number;
  bestTimeSeconds: number | null;
  currentStreak: number;
  bestStreak: number;
  lastWonDate: string | null;
}

const STORAGE_KEY = "mini-crossword-stats";

export const DEFAULT_STATS: Stats = {
  gamesPlayed: 0,
  gamesWon: 0,
  bestTimeSeconds: null,
  currentStreak: 0,
  bestStreak: 0,
  lastWonDate: null,
};

export function loadStats(): Stats {
  if (typeof window === "undefined") return DEFAULT_STATS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATS;
    return { ...DEFAULT_STATS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_STATS;
  }
}

function saveStats(stats: Stats): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function isYesterday(dateKey: string): boolean {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return dateKey === yesterday.toISOString().slice(0, 10);
}

export function recordWin(timeSeconds: number): Stats {
  const stats = loadStats();
  const today = todayKey();

  stats.gamesPlayed += 1;
  stats.gamesWon += 1;
  stats.bestTimeSeconds =
    stats.bestTimeSeconds === null ? timeSeconds : Math.min(stats.bestTimeSeconds, timeSeconds);

  if (stats.lastWonDate !== today) {
    stats.currentStreak = stats.lastWonDate && isYesterday(stats.lastWonDate) ? stats.currentStreak + 1 : 1;
    stats.lastWonDate = today;
  }
  stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);

  saveStats(stats);
  return stats;
}
