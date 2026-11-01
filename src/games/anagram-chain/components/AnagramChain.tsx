"use client";

import { useMemo, useState } from "react";
import WordEntry, { WordTiles } from "@/games/shared/words/WordEntry";
import { getUtcDateKey } from "@/platform/daily";
import StepGameShell from "@/platform/stepGame/StepGameShell";
import { useStepGame } from "@/platform/stepGame/useStepGame";
import { anagramChain } from "../meta";
import { anagramChainManual } from "../manual";
import { ANAGRAM_RULES, AnagramPuzzle, currentWord, lettersLeft, stepsNeeded } from "../lib/rules";

export default function AnagramChain() {
  // The date key picks the puzzle; keying on it gives each day a fresh game state.
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());
  return <AnagramDay key={dateKey} dateKey={dateKey} onPlayDate={setDateKey} />;
}

/** Where `word`'s new letter sits: the first position that isn't one of `before`'s letters. */
function addedAt(before: string, word: string): number[] {
  let left = before;
  for (let i = 0; i < word.length; i++) {
    const j = left.indexOf(word[i]);
    if (j < 0) return [i];
    left = left.slice(0, j) + left.slice(j + 1);
  }
  return [];
}

function AnagramDay({ dateKey, onPlayDate }: { dateKey: string; onPlayDate: (dateKey: string) => void }) {
  const game = useStepGame<AnagramPuzzle>(anagramChain, dateKey, ANAGRAM_RULES);
  const { puzzle, moves, complete, solved, solution } = game;
  const [order, setOrder] = useState<number[] | null>(null);

  const current = puzzle ? currentWord(puzzle, moves) : "";
  // The day's letters, in the order shown (Shuffle changes it), each marked used or not.
  const pool = useMemo(() => {
    if (!puzzle) return [];
    let unused = lettersLeft(puzzle.letters, current) ?? "";
    const indexes = order ?? [...puzzle.letters].map((_, i) => i);
    return indexes.map((i) => {
      const letter = puzzle.letters[i];
      const free = unused.includes(letter);
      if (free) unused = unused.replace(letter, "");
      return { letter, used: !free };
    });
  }, [puzzle, current, order]);

  function shuffle() {
    if (!puzzle) return;
    const next = [...puzzle.letters].map((_, i) => i);
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder(next);
  }

  return (
    <StepGameShell
      info={anagramChain}
      manual={anagramChainManual}
      rules={ANAGRAM_RULES}
      game={game}
      dateKey={dateKey}
      onPlayDate={onPlayDate}
      intro={
        <>
          <p className="font-semibold text-neutral-900 dark:text-neutral-50">
            Grow {puzzle ? puzzle.start.toUpperCase() : "the start word"} into a {puzzle?.letters.length ?? 7}-letter word.
          </p>
          <p>
            Each step, add one of the day&apos;s letters and rearrange to make a new word. Use every letter to finish.
          </p>
        </>
      }
      shareDetail={puzzle ? `${moves.length}/${stepsNeeded(puzzle)} words` : ""}
    >
      {puzzle && (
        <div className="mx-auto flex max-w-md flex-col items-center gap-2">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex gap-1">
              {pool.map(({ letter, used }, i) => (
                <span
                  key={i}
                  className={`flex size-9 items-center justify-center rounded-full font-mono text-lg font-bold uppercase ${
                    used
                      ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-400 dark:text-neutral-600"
                      : "bg-amber-400 text-neutral-900"
                  }`}
                >
                  {letter}
                </span>
              ))}
            </div>
            {!complete && (
              <button
                type="button"
                onClick={shuffle}
                title="Shuffle the letters"
                className="rounded-md px-2 py-1 text-lg hover:bg-neutral-200 dark:hover:bg-neutral-800"
              >
                🔀
              </button>
            )}
          </div>
          <WordTiles word={puzzle.start} tone="start" />
          {moves.map((word, i) => (
            <WordTiles
              key={i}
              word={word}
              tone={solved && i === moves.length - 1 ? "target" : "plain"}
              highlight={solved && i === moves.length - 1 ? [] : addedAt(moves[i - 1] ?? puzzle.start, word)}
            />
          ))}
          {!complete && (
            <div className="mt-1">
              <WordEntry
                length={current.length + 1}
                placeholder={`${current.length + 1}-letter word`}
                onSubmit={game.play}
              />
            </div>
          )}
          {complete && solution && (
            <p className="mt-3 text-center text-sm text-neutral-600 dark:text-neutral-400">
              {!solved ? "One way" : solution.join() === moves.join() ? "The day's chain" : "Another way"}:{" "}
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
