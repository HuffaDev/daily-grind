"use client";

import { Stats } from "@/platform/stats";
import { formatTime as fmtTime } from "@/platform/format";
import ShareButton from "@/platform/components/ShareButton";
import { ScoreBreakdown } from "../lib/scoring";

interface Props {
  timeSeconds: number;
  stats: Stats;
  revealed: boolean;
  breakdown: ScoreBreakdown;
  shareText: string;
  onShare?: (text: string) => Promise<void>;
  onClose: () => void;
}

export default function WinModal({ timeSeconds, stats, revealed, breakdown, shareText, onShare, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl max-w-sm w-full max-h-full overflow-y-auto p-6 text-center animate-[pop_0.25s_ease-out]">
        <div className="text-4xl mb-2">{revealed ? "🔎" : "🎉"}</div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-1">
          {revealed ? "Puzzle Revealed" : "Solved!"}
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          {revealed ? "Here's the completed grid." : `You finished in ${fmtTime(timeSeconds)}.`}
          {" "}
          Come back tomorrow for the next one.
        </p>

        <div className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
          {breakdown.total} <span className="text-base font-medium text-neutral-500 dark:text-neutral-400">pts</span>
        </div>
        <dl className="mt-2 mb-4 text-sm text-neutral-600 dark:text-neutral-400 space-y-0.5">
          <div className="flex justify-between"><dt>Words</dt><dd className="tabular-nums">+{breakdown.words}</dd></div>
          <div className="flex justify-between"><dt>Completion bonus</dt><dd className="tabular-nums">+{breakdown.completion}</dd></div>
          <div className="flex justify-between"><dt>Time bonus</dt><dd className="tabular-nums">+{breakdown.time}</dd></div>
          {breakdown.penalty > 0 && (
            <div className="flex justify-between"><dt>Check penalty</dt><dd className="tabular-nums">−{breakdown.penalty}</dd></div>
          )}
        </dl>

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
          onShare={onShare}
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
