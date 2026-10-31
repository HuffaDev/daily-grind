"use client";

import { Stats } from "@/platform/stats";
import { formatTime } from "@/platform/format";
import ShareButton from "@/platform/components/ShareButton";
import { ScoreBreakdown } from "../lib/scoring";
import { TIERS } from "../lib/types";

interface Props {
  timeSeconds: number;
  stats: Stats;
  /** Every puzzle solved without a reveal. */
  won: boolean;
  breakdown: ScoreBreakdown;
  shareText: string;
  onShare?: (text: string) => Promise<void>;
  onClose: () => void;
}

export default function WinModal({ timeSeconds, stats, won, breakdown, shareText, onShare, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-xl max-w-sm w-full max-h-full overflow-y-auto p-6 text-center animate-[pop_0.25s_ease-out]">
        <div className="text-4xl mb-2">{won ? "🎉" : "🔎"}</div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-neutral-50 mb-1">
          {won ? "All Solved!" : "Done for Today"}
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400 mb-4">
          {won ? `You solved all three in ${formatTime(timeSeconds)}.` : "You revealed at least one solution."} Come
          back tomorrow for new puzzles.
        </p>

        <div className="text-3xl font-bold tabular-nums text-neutral-900 dark:text-neutral-50">
          {breakdown.total} <span className="text-base font-medium text-neutral-500 dark:text-neutral-400">pts</span>
        </div>
        <dl className="mt-2 mb-4 text-sm text-neutral-600 dark:text-neutral-400 space-y-0.5">
          {breakdown.puzzles.map((points, i) => (
            <div key={i} className="flex justify-between">
              <dt>{TIERS[i].name} puzzle</dt>
              <dd className="tabular-nums">+{points}</dd>
            </div>
          ))}
          <div className="flex justify-between"><dt>Completion bonus</dt><dd className="tabular-nums">+{breakdown.completion}</dd></div>
          <div className="flex justify-between"><dt>Time bonus</dt><dd className="tabular-nums">+{breakdown.time}</dd></div>
        </dl>

        <dl className="grid grid-cols-3 gap-2 text-sm mb-6">
          <div className="bg-neutral-100 dark:bg-neutral-800 rounded-lg py-2">
            <dt className="text-neutral-500 dark:text-neutral-400 text-xs">Best time</dt>
            <dd className="font-semibold text-neutral-900 dark:text-neutral-50">
              {stats.bestTimeSeconds !== null ? formatTime(stats.bestTimeSeconds) : "—"}
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
