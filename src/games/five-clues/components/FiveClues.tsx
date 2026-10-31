"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Leaderboard from "@/platform/components/Leaderboard";
import { getDailyPuzzleNumber, getUtcDateKey } from "@/platform/daily";
import { isInDiscord } from "@/platform/discordClient";
import { hand } from "@/platform/roundGame/fonts";
import GameHeader from "@/platform/roundGame/GameHeader";
import HowToPlay from "@/platform/roundGame/HowToPlay";
import ResultCard from "@/platform/roundGame/ResultCard";
import RoundBanner from "@/platform/roundGame/RoundBanner";
import { hint, muted, pressable, primaryButton, screen, secondaryButton } from "@/platform/roundGame/ui";
import { useRoundGame } from "@/platform/roundGame/useRoundGame";
import { Puzzle } from "../lib/content";
import { CLUES_PER_PUZZLE, dailyPuzzles, MAX_POINTS_PER_PUZZLE, MAX_SCORE, pointsAtClue, playFiveClues, puzzlePoints, PuzzleState, QUESTION, replay, shareLine, suggestions } from "../lib/rules";
import { fiveClues } from "../meta";

export default function FiveClues() {
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());
  return <Day key={dateKey} dateKey={dateKey} onPlayDate={setDateKey} />;
}

function Day({ dateKey, onPlayDate }: { dateKey: string; onPlayDate: (dateKey: string) => void }) {
  const puzzles = useMemo(() => dailyPuzzles(dateKey), [dateKey]);
  const game = useRoundGame(fiveClues, dateKey, playFiveClues);
  const states = useMemo(() => replay(puzzles, game.moves), [puzzles, game.moves]);
  // The puzzle whose answer is on screen, until the player moves on.
  const [revealing, setRevealing] = useState<number | null>(null);
  const viewport = useKeyboardSafeViewport();

  const finishedCount = states.filter((state) => state.outcome).length;
  const index = revealing ?? finishedCount;
  const finished = index >= puzzles.length;
  const outcomes = states.flatMap((state) => (state.outcome ? [state.outcome] : []));

  function move(value: string | null) {
    const before = states[index];
    const solved = value === puzzles[index].answer;
    if (solved || before.shown === CLUES_PER_PUZZLE) setRevealing(index);
    game.addMove(value);
  }

  return (
    <div
      className={`${screen} flex flex-col items-center bg-[radial-gradient(ellipse_at_top,#232838_0%,#12141c_65%)] px-4`}
      style={{
        ...viewport,
        paddingTop: "calc(0.5rem + var(--discord-safe-area-inset-top, env(safe-area-inset-top)))",
        paddingBottom: "calc(0.75rem + var(--discord-safe-area-inset-bottom, env(safe-area-inset-bottom)))",
      }}
    >
      <RoundBanner dateKey={dateKey} notice={game.notice} onPlayDate={onPlayDate} />
      <div className="flex min-h-0 w-full max-w-xl flex-1 flex-col">
        <GameHeader
          progress={finished ? "" : `${index + 1} of ${puzzles.length}`}
          action={
            <HowToPlay gameId={fiveClues.id}>
              <p className="mb-2">Each day has a person, a country and an animal to name. You start with one clue, the hardest.</p>
              <p className="mb-2">Type a guess and pick a name from the list. A wrong guess shows the next clue, and <strong>Next clue</strong> shows it without guessing.</p>
              <p className="text-[#ece7dc]/70">A right answer scores 250 on the first clue, then 50 less for each clue after that. Missing all five scores nothing.</p>
            </HowToPlay>
          }
        />
        {game.loaded && !finished && states[index] && (
          <Round
            key={index}
            puzzle={puzzles[index]}
            state={states[index]}
            isLast={index === puzzles.length - 1}
            onMove={move}
            onNext={() => setRevealing(null)}
          />
        )}
      </div>

      {game.loaded && finished && (
        <ResultCard
          score={game.result.points}
          howScored={`Up to ${MAX_POINTS_PER_PUZZLE} points for each answer. Every extra clue costs 50.`}
          maxScore={MAX_SCORE}
          detailHeading="Solved on"
          rows={puzzles.map((puzzle, i) => ({
            label: puzzle.answer,
            detail: outcomes[i].solvedOnClue === null ? "Missed" : `Clue ${outcomes[i].solvedOnClue}`,
            points: puzzlePoints(outcomes[i]),
          }))}
          maxPerRow={MAX_POINTS_PER_PUZZLE}
          stats={game.stats}
          shareText={shareLine(getDailyPuzzleNumber(dateKey), outcomes, isInDiscord() ? undefined : window.location.href)}
          onShare={game.onShare}
        >
          {game.connection && <Leaderboard connection={game.connection} game={fiveClues} puzzleId={game.puzzleId} myPoints={game.serverPoints} className="mt-5" />}
        </ResultCard>
      )}
    </div>
  );
}

/**
 * Keeps the screen inside the part of the window the phone's keyboard leaves
 * free, so the guess box at the bottom stays visible while typing.
 */
function useKeyboardSafeViewport(): React.CSSProperties | undefined {
  const [style, setStyle] = useState<React.CSSProperties>();
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => setStyle({ top: viewport.offsetTop, bottom: "auto", height: viewport.height });
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);
  return style;
}

function Round({ puzzle, state, isLast, onMove, onNext }: { puzzle: Puzzle; state: PuzzleState; isLast: boolean; onMove: (value: string | null) => void; onNext: () => void }) {
  const [typed, setTyped] = useState("");
  const newestRef = useRef<HTMLLIElement>(null);
  const { shown, wrong, outcome } = state;
  const options = useMemo(() => suggestions(puzzle.kind, typed, wrong), [puzzle.kind, typed, wrong]);
  const lastClue = shown === CLUES_PER_PUZZLE;
  const noMatch = typed.trim().length >= 2 && options.length === 0;

  useEffect(() => {
    newestRef.current?.scrollIntoView({ block: "nearest" });
  }, [shown]);

  function guess(name: string) {
    setTyped("");
    onMove(name);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (options[0]) guess(options[0]);
  }

  return (
    <>
      <h1 className={`${hand.className} pt-1 text-center text-5xl leading-none short:text-2xl`}>
        {QUESTION[puzzle.kind]}
      </h1>
      <p className={`${muted} pb-3 pt-1 text-center text-sm tabular-nums short:hidden`}>
        {outcome ? "All five clues" : `Clue ${shown} of ${CLUES_PER_PUZZLE}, worth ${pointsAtClue(shown)} points`}
      </p>

      {/* Every clue has its slot from the start, sized to its text, so nothing moves when one turns over. */}
      <ol className="grid min-h-0 flex-1 auto-rows-[minmax(min-content,1fr)] gap-2 overflow-y-auto pb-3">
        {puzzle.clues.map((clue, i) => {
          const open = outcome !== null || i < shown;
          return (
            <li
              key={clue}
              ref={i === shown - 1 ? newestRef : undefined}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-2 ${open ? "bg-[#f4ecd8] text-[#1c1a16] shadow-md shadow-black/30" : "border border-dashed border-white/15 text-[#ece7dc]/40"}`}
            >
              <span className={`${hand.className} w-5 shrink-0 text-center text-3xl leading-none ${open ? "text-[#b45309]" : ""}`}>{i + 1}</span>
              <span className={`text-sm leading-snug sm:text-base ${open ? "" : "invisible"}`}>{clue}</span>
              {!open && <span className="absolute left-11 top-1/2 -translate-y-1/2 text-sm tabular-nums">Worth {pointsAtClue(i + 1)} points</span>}
            </li>
          );
        })}
      </ol>

      {/* A fixed height for the footer too, so the buttons stay put from one state to the next. */}
      <div className="relative h-28 shrink-0 short:h-14">
        {outcome ? (
          <div className="flex h-full items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className={`${hand.className} text-4xl leading-none short:text-2xl`}>
                {puzzle.answer}
              </p>
              <p className={`mt-1 text-sm font-semibold short:mt-0 ${outcome.solvedOnClue === null ? "text-[#fbbf24]" : "text-[#7db0ff]"}`}>
                {outcome.solvedOnClue === null ? "✗ Missed, 0 points" : `✓ Clue ${outcome.solvedOnClue}, ${puzzlePoints(outcome)} points`}
              </p>
            </div>
            <button type="button" onClick={onNext} className={`${primaryButton} shrink-0`}>
              {isLast ? "See result" : "Next"}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex h-full flex-col justify-end gap-2">
            <p className={`${hint} h-5 truncate text-center short:hidden`} aria-live="polite">
              {noMatch ? "No match. Pick a name from the list." : wrong.length > 0 ? `Not ${wrong.join(", not ")}` : "A wrong guess shows the next clue."}
            </p>
            <div className="relative flex gap-2">
              {options.length > 0 && (
                <ul className="absolute inset-x-0 bottom-full z-10 mb-1 divide-y divide-white/10 overflow-hidden rounded-xl bg-[#2b3142] shadow-xl shadow-black/60 ring-2 ring-[#f4ecd8]">
                  {options.map((name, i) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => guess(name)}
                        className={`${pressable} flex min-h-11 w-full items-center justify-between px-4 text-left font-medium ${i === 0 ? "bg-[#f4ecd8] text-[#1c1a16]" : "text-[#ece7dc] hover:bg-white/15"}`}
                      >
                        {name}
                        {i === 0 && <span aria-hidden className="hidden text-xs font-normal opacity-60 sm:inline">Enter</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <input
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder="Type your guess"
                aria-label="Your guess"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="min-h-12 min-w-0 flex-1 select-text rounded-xl bg-[#232838] px-4 text-base text-[#ece7dc] ring-1 ring-white/20 placeholder:text-[#ece7dc]/50 focus:outline-2 focus:outline-[#f4ecd8]"
              />
              <button type="button" onClick={() => onMove(null)} className={`${secondaryButton} w-28 shrink-0 whitespace-nowrap px-2!`}>
                {lastClue ? "Give up" : "Next clue"}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}
