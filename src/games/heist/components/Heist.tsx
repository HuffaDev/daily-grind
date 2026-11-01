"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getUtcDateKey } from "@/platform/daily";
import StepGameShell from "@/platform/stepGame/StepGameShell";
import { useStepGame } from "@/platform/stepGame/useStepGame";
import { heist } from "../meta";
import { heistManual } from "../manual";
import { guardAt, guardSight, HEIST_RULES, HeistPuzzle, SIZE, stateAfter } from "../lib/heist";

export default function Heist() {
  // The date key picks the puzzle; keying on it gives each day a fresh game state.
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());
  return <HeistDay key={dateKey} dateKey={dateKey} onPlayDate={setDateKey} />;
}

const KEYS: Record<string, string> = {
  ArrowUp: "U",
  ArrowDown: "D",
  ArrowLeft: "L",
  ArrowRight: "R",
  w: "U",
  s: "D",
  a: "L",
  d: "R",
  " ": "W",
  ".": "W",
};

const ARROWS: Record<string, string> = { U: "↑", D: "↓", L: "←", R: "→", W: "⏸" };

function HeistDay({ dateKey, onPlayDate }: { dateKey: string; onPlayDate: (dateKey: string) => void }) {
  const game = useStepGame<HeistPuzzle>(heist, dateKey, HEIST_RULES);
  const { puzzle, moves, started, complete, solution, play, undo } = game;
  const [error, setError] = useState<string | null>(null);

  const move = useCallback((m: string) => setError(play(m)), [play]);

  useEffect(() => {
    if (!started || complete) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Backspace" || e.key === "z") {
        e.preventDefault();
        undo();
        setError(null);
        return;
      }
      const m = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (!m) return;
      e.preventDefault();
      move(m);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [started, complete, move, undo]);

  const state = useMemo(() => (puzzle ? stateAfter(puzzle, moves) : null), [puzzle, moves]);
  const watched = useMemo(() => {
    const cells = new Set<string>();
    if (!puzzle || !state) return cells;
    for (const route of puzzle.guards) for (const [r, c] of guardSight(puzzle.map, route, state.turn)) cells.add(`${r},${c}`);
    return cells;
  }, [puzzle, state]);

  const turns = moves.length;

  return (
    <StepGameShell
      info={heist}
      manual={heistManual}
      rules={HEIST_RULES}
      game={game}
      dateKey={dateKey}
      onPlayDate={onPlayDate}
      intro={
        <>
          <p className="font-semibold text-neutral-900 dark:text-neutral-50">Grab the 💰 and slip out the 🚪 unseen.</p>
          <p>
            Each turn, step or wait, then every guard takes a step along its beat. Stay out of the red squares they can see.
            Pull it off in par for full points.
          </p>
        </>
      }
      shareDetail={puzzle ? `${turns} turn${turns === 1 ? "" : "s"} (par ${puzzle.par})` : ""}
    >
      {puzzle && state && (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Par {puzzle.par} · turn {turns} · {state.looted ? "💰 grabbed, head for the 🚪" : "find the 💰"}
          </p>
          <div
            className="grid w-full max-w-[360px] short:max-w-[calc(100dvh-9rem)] gap-0.5 rounded-lg bg-neutral-800 p-1"
            style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
          >
            {puzzle.map.flatMap((row, r) =>
              [...row].map((tile, c) => {
                const here = state.at[0] === r && state.at[1] === c;
                const guard = puzzle.guards.some((route) => {
                  const [gr, gc] = guardAt(route, state.turn);
                  return gr === r && gc === c;
                });
                const isLoot = !state.looted && puzzle.loot[0] === r && puzzle.loot[1] === c;
                const isExit = puzzle.exit[0] === r && puzzle.exit[1] === c;
                const seen = watched.has(`${r},${c}`);
                return (
                  <div
                    key={`${r},${c}`}
                    className={`flex aspect-square items-center justify-center rounded-sm text-xl sm:text-2xl ${
                      tile === "#" ? "bg-neutral-700" : seen ? "bg-red-300 dark:bg-red-900" : "bg-stone-100 dark:bg-stone-300"
                    }`}
                  >
                    {here ? "🥷" : guard ? "💂" : isLoot ? "💰" : isExit ? "🚪" : ""}
                  </div>
                );
              })
            )}
          </div>
          {!complete && (
            <>
              <p role="status" className="h-5 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  ["", "U", ""],
                  ["L", "W", "R"],
                  ["", "D", ""],
                ].flatMap((row, i) =>
                  row.map((m, j) =>
                    m ? (
                      <button
                        key={`${i},${j}`}
                        type="button"
                        onClick={() => move(m)}
                        aria-label={m === "W" ? "Wait" : `Move ${ARROWS[m]}`}
                        className="size-12 rounded-lg bg-neutral-200 dark:bg-neutral-800 text-xl font-bold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700"
                      >
                        {ARROWS[m]}
                      </button>
                    ) : (
                      <span key={`${i},${j}`} />
                    )
                  )
                )}
              </div>
              <p className="short:hidden text-xs text-neutral-500 dark:text-neutral-400">
                Arrows or WASD move · Space waits · Backspace undoes
              </p>
            </>
          )}
          {complete && solution && (
            <p className="text-center text-sm text-neutral-600 dark:text-neutral-400">
              A par route ({solution.length} turns):{" "}
              <span className="font-mono text-neutral-900 dark:text-neutral-50">{solution.map((m) => ARROWS[m]).join("")}</span>
            </p>
          )}
        </div>
      )}
    </StepGameShell>
  );
}
