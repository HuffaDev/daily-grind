"use client";

import { useEffect, useState } from "react";

/** A game's how-to-play guide, written to be skimmed in big type. */
export interface Manual {
  /** The whole game in one plain sentence, shown first in a callout. */
  short: string;
  /** What to do, in order. */
  steps: { emoji: string; title: string; text: string }[];
  /** How points work, one line each. */
  scoring: string[];
  /** Optional advice, one line each. */
  tips?: string[];
}

const defaultButton =
  "px-3 py-1.5 rounded-md text-sm font-semibold bg-amber-400 text-neutral-900 hover:bg-amber-300 transition-colors";

interface Props {
  gameId: string;
  name: string;
  manual: Manual;
  /** Replaces the header button's look, for pages with their own style. */
  buttonClassName?: string;
}

/**
 * The "How to play" button and the full-screen guide it opens. The guide also
 * opens by itself the first time someone plays the game on this device.
 */
export default function GameManual({ gameId, name, manual, buttonClassName = defaultButton }: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seenKey = `daily-grind:${gameId}:seen-manual`;
    try {
      if (window.localStorage.getItem(seenKey)) return;
      window.localStorage.setItem(seenKey, "1");
    } catch {
      // Storage can be blocked in embeds; then it opens on each visit.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(true);
  }, [gameId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`pointer-events-auto ${buttonClassName}`}>
        📖 How to play
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`How to play ${name}`}
          className="pointer-events-auto fixed inset-0 z-50 overflow-y-auto bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-50 font-sans [text-shadow:none] select-text"
        >
          <div className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-8 sm:py-12 text-left">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-4xl sm:text-5xl font-black leading-tight">
                📖 How to play
                <span className="block text-amber-600 dark:text-amber-400">{name}</span>
              </h2>
              <button
                type="button"
                autoFocus
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="shrink-0 rounded-full size-12 text-2xl bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700"
              >
                ✕
              </button>
            </div>

            <section className="rounded-2xl bg-amber-100 dark:bg-amber-950 ring-2 ring-amber-400 p-5">
              <p className="text-sm font-bold uppercase tracking-widest text-amber-800 dark:text-amber-300">The short version</p>
              <p className="mt-2 text-2xl sm:text-3xl font-bold leading-snug">{manual.short}</p>
            </section>

            <section>
              <h3 className="text-3xl font-black">What to do</h3>
              <ol className="mt-4 flex flex-col gap-5">
                {manual.steps.map((step, i) => (
                  <li key={i} className="flex gap-4">
                    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-neutral-900 dark:bg-neutral-50 text-2xl font-black text-white dark:text-neutral-900">
                      {i + 1}
                    </span>
                    <div>
                      <p className="text-2xl font-bold leading-snug">
                        <span aria-hidden>{step.emoji} </span>
                        {step.title}
                      </p>
                      <p className="mt-1 text-xl leading-relaxed text-neutral-700 dark:text-neutral-300">{step.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            <section>
              <h3 className="text-3xl font-black">Points</h3>
              <ul className="mt-4 flex flex-col gap-3">
                {manual.scoring.map((line, i) => (
                  <li key={i} className="text-xl leading-relaxed">
                    <span aria-hidden>⭐ </span>
                    {line}
                  </li>
                ))}
              </ul>
            </section>

            {manual.tips && manual.tips.length > 0 && (
              <section>
                <h3 className="text-3xl font-black">Tips</h3>
                <ul className="mt-4 flex flex-col gap-3">
                  {manual.tips.map((line, i) => (
                    <li key={i} className="text-xl leading-relaxed">
                      <span aria-hidden>💡 </span>
                      {line}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full rounded-2xl bg-amber-400 hover:bg-amber-300 py-5 text-2xl font-black text-neutral-900 transition-colors"
            >
              Got it, let me play
            </button>
          </div>
        </div>
      )}
    </>
  );
}
