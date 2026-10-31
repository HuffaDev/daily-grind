"use client";

import { CircleHelp } from "lucide-react";
import { ReactNode, useEffect, useState } from "react";
import { hand } from "./fonts";
import { panel, pressable, primaryButton } from "./ui";

/** Opens by itself on the first game, then stays one tap away behind the help button. */
export default function HowToPlay({ gameId, children }: { gameId: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seenKey = `daily-grind:${gameId}:seen-help`;
    try {
      if (window.localStorage.getItem(seenKey)) return;
      window.localStorage.setItem(seenKey, "1");
    } catch {
      // Storage can be blocked in embeds. Then it just shows on each visit.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [gameId]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="How to play"
        className={`${pressable} pointer-events-auto flex size-8 items-center justify-center rounded-full text-[#ece7dc]/85 hover:bg-white/10`}
      >
        <CircleHelp className="size-5" aria-hidden />
      </button>
      {open && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/65 p-3 [text-shadow:none]" role="dialog" aria-modal="true" aria-label="How to play">
          <div className={`${panel} max-h-full w-full max-w-md overflow-y-auto p-5 text-left text-sm leading-relaxed`}>
            <h2 className={`${hand.className} mb-2 text-4xl leading-none`}>How to play</h2>
            {children}
            <button type="button" autoFocus onClick={() => setOpen(false)} className={`${primaryButton} mt-4 w-full`}>
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
