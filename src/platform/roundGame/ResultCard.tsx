"use client";

import { ReactNode } from "react";
import LaunchLink from "@/platform/components/LaunchLink";
import ShareButton from "@/platform/components/ShareButton";
import type { Stats } from "../stats";
import { hand } from "./fonts";
import { muted, panel, primaryButton, secondaryButton } from "./ui";

export interface ResultRow {
  label: string;
  /** What happened, such as "12° off". */
  detail: string;
  points: number;
}

interface Props {
  score: number;
  maxScore: number;
  /** How the points work, such as "Up to 150 points for each city". */
  howScored: string;
  detailHeading: string;
  rows: ResultRow[];
  maxPerRow: number;
  shareText: string;
  onShare?: (text: string) => Promise<void>;
  stats: Stats;
  /** Shown below the buttons, such as the leaderboard. */
  children?: ReactNode;
}

/** The end-of-game popup every round game shares, so each one says what its numbers mean. */
export default function ResultCard({ score, maxScore, howScored, detailHeading, rows, maxPerRow, shareText, onShare, stats, children }: Props) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/65 p-3" role="dialog" aria-label="Results">
      <div className={`${panel} max-h-full w-full max-w-md select-text overflow-y-auto p-5`}>
        <p className={`${hand.className} text-center text-7xl leading-none`}>
          {score}
          <span className="text-3xl text-[#ece7dc]/55"> / {maxScore}</span>
        </p>
        <p className={`${muted} mb-4 mt-2 text-center text-sm`}>{howScored}</p>
        <table className="mb-5 w-full text-sm">
          <thead className="text-left text-xs font-medium uppercase tracking-wider text-[#ece7dc]/50">
            <tr>
              <th className="pb-2 font-medium" />
              <th className="pb-2 font-medium">{detailHeading}</th>
              <th className="pb-2 text-right font-medium">Points</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-white/10">
                <td className="py-2 pr-2 font-medium">{row.label}</td>
                <td className={`${muted} py-2 pr-2 tabular-nums`}>{row.detail}</td>
                <td className="py-2 text-right font-medium tabular-nums">
                  {row.points}
                  <span className="font-normal text-[#ece7dc]/45"> / {maxPerRow}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={`${muted} mb-4 text-center text-sm tabular-nums`}>
          Streak {stats.currentStreak} · Solved {stats.gamesWon} of {stats.gamesPlayed}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <ShareButton text={shareText} onShare={onShare} className={primaryButton} />
          <LaunchLink href="/" className={secondaryButton}>
            All games
          </LaunchLink>
        </div>
        {children && <div className="dark">{children}</div>}
      </div>
    </div>
  );
}
