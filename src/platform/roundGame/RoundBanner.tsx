"use client";

import { useUtcDateKey } from "../useUtcDateKey";
import { pressable } from "./ui";

interface Props {
  dateKey: string;
  notice: string | null;
  onPlayDate: (dateKey: string) => void;
}

/**
 * Sync problems, and the next day's puzzle once it's out. The game stays on its
 * puzzle past 00:00 UTC so it can be finished; the player chooses when to move on.
 */
export default function RoundBanner({ dateKey, notice, onPlayDate }: Props) {
  const today = useUtcDateKey();
  const newPuzzleOut = today !== dateKey;
  if (!notice && !newPuzzleOut) return null;
  return (
    <div
      className="pointer-events-auto fixed inset-x-3 z-40 mx-auto flex max-w-md flex-col gap-2 text-sm"
      style={{ top: "calc(2.75rem + var(--discord-safe-area-inset-top, env(safe-area-inset-top)))" }}
    >
      {notice && <p className="rounded-lg bg-[#7f1d1d] px-3 py-2 text-white shadow-lg">{notice}</p>}
      {newPuzzleOut && (
        <div className="flex items-center justify-between gap-3 rounded-lg bg-[#1d4ed8] px-3 py-2 text-white shadow-lg">
          <span>A new puzzle is out.</span>
          <button type="button" onClick={() => onPlayDate(today)} className={`${pressable} shrink-0 rounded-md bg-white/20 px-3 py-1 font-medium hover:bg-white/30`}>
            Play it
          </button>
        </div>
      )}
    </div>
  );
}
