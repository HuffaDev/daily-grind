"use client";

import { useState } from "react";
import WordEntry, { WordTiles } from "@/games/shared/words/WordEntry";
import { getUtcDateKey } from "@/platform/daily";
import StepGameShell from "@/platform/stepGame/StepGameShell";
import { useStepGame } from "@/platform/stepGame/useStepGame";
import { ladder } from "../meta";
import { ladderManual } from "../manual";
import { LADDER_RULES, LadderPuzzle, WORD_LENGTH } from "../lib/rules";

export default function Ladder() {
  // The date key picks the puzzle; keying on it gives each day a fresh game state.
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());
  return <LadderDay key={dateKey} dateKey={dateKey} onPlayDate={setDateKey} />;
}

/** Positions where `word` differs from the word before it. */
function changed(before: string, word: string): number[] {
  return [...word].flatMap((letter, i) => (letter === before[i] ? [] : [i]));
}

function LadderDay({ dateKey, onPlayDate }: { dateKey: string; onPlayDate: (dateKey: string) => void }) {
  const game = useStepGame<LadderPuzzle>(ladder, dateKey, LADDER_RULES);
  const { puzzle, moves, complete, solved, solution } = game;
  const steps = moves.length;

  return (
    <StepGameShell
      info={ladder}
      manual={ladderManual}
      rules={LADDER_RULES}
      game={game}
      dateKey={dateKey}
      onPlayDate={onPlayDate}
      intro={
        <>
          <p className="font-semibold text-neutral-900 dark:text-neutral-50">
            {puzzle ? `Turn ${puzzle.start.toUpperCase()} into ${puzzle.target.toUpperCase()}.` : "Climb from one word to another."}
          </p>
          <p>Change one letter at a time, and every step must be a real word. Reach it in par ({puzzle?.par ?? "?"} steps) for full points.</p>
        </>
      }
      shareDetail={puzzle ? `${steps} step${steps === 1 ? "" : "s"} (par ${puzzle.par})` : ""}
    >
      {puzzle && (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-2">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Par {puzzle.par} · {steps} step{steps === 1 ? "" : "s"} so far
          </p>
          <WordTiles word={puzzle.start} tone="start" />
          {moves.map((word, i) => (
            <WordTiles
              key={i}
              word={word}
              tone={i === moves.length - 1 && solved ? "target" : "plain"}
              highlight={i === moves.length - 1 && solved ? [] : changed(moves[i - 1] ?? puzzle.start, word)}
            />
          ))}
          {!complete && (
            <>
              <div className="my-1">
                <WordEntry length={WORD_LENGTH} placeholder="Next word" onSubmit={game.play} />
              </div>
              <WordTiles word={puzzle.target} tone="ghost" />
            </>
          )}
          {complete && solution && (
            <p className="mt-3 text-center text-sm text-neutral-600 dark:text-neutral-400">
              {solved ? "A par route" : "One way up"}:{" "}
              <span className="font-mono font-semibold uppercase text-neutral-900 dark:text-neutral-50">
                {[puzzle.start, ...solution].join(" → ")}
              </span>
            </p>
          )}
        </div>
      )}
    </StepGameShell>
  );
}
