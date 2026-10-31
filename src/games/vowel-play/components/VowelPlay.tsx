"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getUtcDateKey } from "@/platform/daily";
import StepGameShell from "@/platform/stepGame/StepGameShell";
import { useStepGame } from "@/platform/stepGame/useStepGame";
import { vowelPlay } from "../meta";
import {
  cleanGuess,
  ClueKind,
  ClueResult,
  hashAnswer,
  MAX_GUESS_LENGTH,
  PASS,
  PASS_PENALTY,
  stateAfter,
  VOWEL_PLAY_RULES,
  VowelPlayPuzzle,
  WRONG_PENALTY,
} from "../lib/rules";

export default function VowelPlay() {
  // The date key picks the puzzle; keying on it gives each day a fresh game state.
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());
  return <VowelPlayDay key={dateKey} dateKey={dateKey} onPlayDate={setDateKey} />;
}

const KIND_LABEL: Record<ClueKind, string> = { movie: "🎬 Film", tv: "📺 TV show" };

/** One square per title for the share text: green first try, yellow after wrong guesses, black for a pass. */
function resultEmoji(result: ClueResult): string {
  if (result.status === "passed") return "⬛";
  return result.wrong.length > 0 ? "🟨" : "🟩";
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function VowelPlayDay({ dateKey, onPlayDate }: { dateKey: string; onPlayDate: (dateKey: string) => void }) {
  const game = useStepGame<VowelPlayPuzzle>(vowelPlay, dateKey, VOWEL_PLAY_RULES);
  const { puzzle, moves, complete, solution, play } = game;
  const [value, setValue] = useState("");
  const [feedback, setFeedback] = useState<{ tone: "good" | "bad" | "info"; text: string } | null>(null);
  const [confirmPass, setConfirmPass] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const state = useMemo(() => (puzzle ? stateAfter(puzzle, moves) : null), [puzzle, moves]);
  const clue = puzzle && state ? puzzle.clues[state.current] : undefined;

  useEffect(() => {
    if (!confirmPass) return;
    const id = setTimeout(() => setConfirmPass(false), 3000);
    return () => clearTimeout(id);
  }, [confirmPass]);

  // Ready to type straight away on each new title.
  const clueIndex = state?.current;
  useEffect(() => {
    if (!complete) inputRef.current?.focus();
  }, [clueIndex, complete]);

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!puzzle || !clue) return;
    const guess = cleanGuess(value);
    if (!guess) return;
    const reason = play(guess);
    if (reason) {
      setFeedback({ tone: "info", text: reason });
      return;
    }
    setValue("");
    setConfirmPass(false);
    setFeedback(
      hashAnswer(puzzle.salt, guess) === clue.check
        ? { tone: "good", text: `✅ ${guess.toUpperCase()}` }
        : { tone: "bad", text: `❌ Not that one (−${WRONG_PENALTY})` }
    );
  }

  function pass() {
    if (!confirmPass) return setConfirmPass(true);
    setConfirmPass(false);
    if (play(PASS) === null) {
      setValue("");
      setFeedback({ tone: "info", text: "Passed. The answer's shown at the end." });
    }
  }

  const shareDetail = state
    ? [
        state.results.map(resultEmoji).join(""),
        `${state.right}/${puzzle!.clues.length} · ${plural(state.passes, "pass", "passes")} · ${state.wrong} wrong`,
      ].join("\n")
    : "";

  const feedbackClass = {
    good: "text-green-700 dark:text-green-400",
    bad: "text-red-600 dark:text-red-400",
    info: "text-neutral-600 dark:text-neutral-400",
  };

  return (
    <StepGameShell
      info={vowelPlay}
      rules={VOWEL_PLAY_RULES}
      game={game}
      dateKey={dateKey}
      onPlayDate={onPlayDate}
      intro={
        <>
          <p className="font-semibold text-neutral-900 dark:text-neutral-50">Ten films and TV shows. No vowels.</p>
          <p>
            Each title has had its vowels taken out, like <span className="font-mono font-bold">BRKNGBD</span>. Type the full
            title. Wrong guesses cost {WRONG_PENALTY} points and passing costs {PASS_PENALTY}, so think before you type!
          </p>
        </>
      }
      shareDetail={shareDetail}
    >
      {puzzle && state && (
        <div className="mx-auto flex max-w-lg flex-col items-center gap-4">
          <ol className="flex gap-1.5" aria-label="Titles">
            {puzzle.clues.map((_, i) => {
              const result = state.results[i];
              const tone = !result
                ? i === state.current
                  ? "bg-white dark:bg-neutral-900 ring-2 ring-amber-500"
                  : "bg-neutral-200 dark:bg-neutral-800"
                : result.status === "passed"
                  ? "bg-neutral-500 dark:bg-neutral-600"
                  : result.wrong.length > 0
                    ? "bg-amber-400"
                    : "bg-green-600";
              return <li key={i} className={`size-5 rounded ${tone}`} aria-label={result ? result.status : `Title ${i + 1}`} />;
            })}
          </ol>

          {clue && !complete && (
            <>
              <div className="w-full rounded-xl bg-white dark:bg-neutral-900 ring-1 ring-neutral-300 dark:ring-neutral-800 px-4 py-6 text-center shadow-sm">
                <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
                  {state.current + 1} of {puzzle.clues.length} · {KIND_LABEL[clue.kind]}
                </p>
                {/* One unbroken run of letters; break-all lets a long title wrap on a phone. */}
                <p className="font-mono text-3xl sm:text-4xl font-bold tracking-[0.2em] break-all text-neutral-900 dark:text-neutral-50">
                  {clue.letters}
                </p>
              </div>

              <form onSubmit={submit} className="flex w-full flex-col items-center gap-2">
                <div className="flex w-full gap-2">
                  <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => {
                      setValue(e.target.value);
                      setFeedback(null);
                    }}
                    maxLength={MAX_GUESS_LENGTH + 8}
                    placeholder="Type the title"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    aria-label="Your guess"
                    className="min-w-0 flex-1 rounded-lg px-3 py-2 text-lg bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 ring-1 ring-neutral-300 dark:ring-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg font-semibold bg-amber-500 hover:bg-amber-400 text-neutral-900 transition-colors"
                  >
                    Guess
                  </button>
                  <button
                    type="button"
                    onClick={pass}
                    className="px-3 py-2 rounded-lg text-sm font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
                    title={`Skip this title (−${PASS_PENALTY})`}
                  >
                    {confirmPass ? "Sure?" : `Pass −${PASS_PENALTY}`}
                  </button>
                </div>
                <p role="status" className={`h-5 text-sm ${feedback ? feedbackClass[feedback.tone] : ""}`}>
                  {feedback?.text}
                </p>
              </form>

              {state.wrongHere.length > 0 && (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  Tried:{" "}
                  {state.wrongHere.map((guess, i) => (
                    <span key={i} className="mr-2 uppercase line-through">
                      {guess}
                    </span>
                  ))}
                </p>
              )}
            </>
          )}

          {(state.results.length > 0 || complete) && (
            <ul className="w-full divide-y divide-neutral-200 dark:divide-neutral-800 rounded-lg bg-white dark:bg-neutral-900 ring-1 ring-neutral-200 dark:ring-neutral-800 text-sm">
              {puzzle.clues.map((c, i) => {
                const result = state.results[i];
                const answer = solution?.[i];
                if (!result && !complete) return null;
                return (
                  <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 break-all font-mono font-semibold text-neutral-500 dark:text-neutral-400">{c.letters}</span>
                    <span className="text-right">
                      {result?.status === "right" ? (
                        <span className="font-semibold text-green-700 dark:text-green-400">
                          {answer ?? result.guess.toUpperCase()}
                          {result.wrong.length > 0 && (
                            <span className="ml-1 font-normal text-amber-600 dark:text-amber-400">
                              ({plural(result.wrong.length, "miss", "misses")})
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-neutral-600 dark:text-neutral-300">
                          {answer ?? (result ? "passed" : "…")}
                          {result?.status === "passed" && " ⏭"}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </StepGameShell>
  );
}
