"use client";

import { Stats } from "@/lib/stats";
import { formatTime as fmtTime } from "@/lib/puzzleUtils";
import ShareButton from "./ShareButton";

interface Props {
  timeSeconds: number;
  stats: Stats;
  revealed: boolean;
  shareText: string;
  onClose: () => void;
}

export default function WinModal({ timeSeconds, stats, revealed, shareText, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl max-w-sm w-full p-6 text-center animate-[pop_0.25s_ease-out]">
        <div className="text-4xl mb-2">{revealed ? "🔎" : "🎉"}</div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-1">
          {revealed ? "Puzzle Revealed" : "Solved!"}
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          {revealed ? "Here's the completed grid." : `You finished in ${fmtTime(timeSeconds)}.`}
          {" "}
          Come back tomorrow for the next one.
        </p>

        <dl className="grid grid-cols-3 gap-2 text-sm mb-6">
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg py-2">
            <dt className="text-neutral-500 dark:text-neutral-400 text-xs">Best time</dt>
            <dd className="font-semibold text-neutral-900 dark:text-neutral-50">
              {stats.bestTimeSeconds !== null ? fmtTime(stats.bestTimeSeconds) : "—"}
            </dd>
          </div>
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg py-2">
            <dt className="text-neutral-500 dark:text-neutral-400 text-xs">Streak</dt>
            <dd className="font-semibold text-neutral-900 dark:text-neutral-50">{stats.currentStreak}</dd>
          </div>
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg py-2">
            <dt className="text-neutral-500 dark:text-neutral-400 text-xs">Won</dt>
            <dd className="font-semibold text-neutral-900 dark:text-neutral-50">{stats.gamesWon}</dd>
          </div>
        </dl>

        <ShareButton
          text={shareText}
          className="w-full bg-amber-500 hover:bg-amber-400 text-neutral-900 font-semibold rounded-lg py-2 transition-colors mb-2"
        />
        <button
          type="button"
          onClick={onClose}
          className="w-full text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 py-1 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
