"use client";

import { Chess, Square } from "chess.js";
import { CSSProperties, useEffect, useMemo, useState } from "react";
import { Chessboard, defaultPieces } from "react-chessboard";
import { judgeMove, playerColor, playUci, sequence, solutionText, Verdict } from "../lib/solution";
import { mistakePenalty, puzzlePoints, puzzleStatus } from "../lib/scoring";
import { ChessPuzzle, PuzzleProgress } from "../lib/types";

/** Pause before each move the board plays by itself: the setup move, replies, a revealed solution. */
const MOVE_DELAY_MS = 550;
/** How long a wrong move stays on the board before it's taken back. */
const WRONG_MOVE_MS = 700;

const LAST_MOVE: CSSProperties = { backgroundColor: "rgba(255, 214, 0, 0.42)" };
const WRONG: CSSProperties = { backgroundColor: "rgba(220, 38, 38, 0.55)" };
const SELECTED: CSSProperties = { backgroundColor: "rgba(20, 110, 60, 0.5)" };
const TARGET: CSSProperties = { background: "radial-gradient(circle, rgba(20, 110, 60, 0.55) 22%, transparent 24%)" };
const CAPTURE: CSSProperties = { background: "radial-gradient(circle, transparent 62%, rgba(20, 110, 60, 0.55) 64%)" };

interface Props {
  puzzle: ChessPuzzle;
  /** Index in TIERS, for points. */
  tier: number;
  progress: PuzzleProgress;
  onProgress: (progress: PuzzleProgress) => void;
}

function squares(uci: string): [string, string] {
  return [uci.slice(0, 2), uci.slice(2, 4)];
}

/** One puzzle's board: plays the opponent's moves, takes the player's, and says how they did. */
export default function PuzzleBoard({ puzzle, tier, progress, onProgress }: Props) {
  const status = puzzleStatus(puzzle, progress);
  const color = playerColor(puzzle);
  // Every move the board should end up showing. A reveal plays out the whole solution.
  const target = useMemo(
    () => (status === "revealed" ? puzzle.moves : sequence(puzzle, progress.line)),
    [puzzle, progress.line, status]
  );
  // How many of them are on the board: starts one short so the last move animates in.
  const [shown, setShown] = useState(() => Math.max(0, target.length - 1));
  const [wrongMove, setWrongMove] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: string; to: string } | null>(null);
  const [lastVerdict, setLastVerdict] = useState<Verdict | null>(null);
  const [confirmReveal, setConfirmReveal] = useState(false);
  const visible = Math.min(shown, target.length);

  useEffect(() => {
    if (visible >= target.length) return;
    const id = setTimeout(() => setShown(visible + 1), MOVE_DELAY_MS);
    return () => clearTimeout(id);
  }, [visible, target.length]);

  useEffect(() => {
    if (!wrongMove) return;
    const id = setTimeout(() => setWrongMove(null), WRONG_MOVE_MS);
    return () => clearTimeout(id);
  }, [wrongMove]);

  useEffect(() => {
    if (!confirmReveal) return;
    const id = setTimeout(() => setConfirmReveal(false), 3000);
    return () => clearTimeout(id);
  }, [confirmReveal]);

  // The position the player moves in: everything shown so far, without the wrong move on top.
  const game = useMemo(() => {
    const chess = new Chess(puzzle.fen);
    for (const uci of target.slice(0, visible)) playUci(chess, uci);
    return chess;
  }, [puzzle.fen, target, visible]);

  const fen = useMemo(() => {
    if (!wrongMove) return game.fen();
    const chess = new Chess(game.fen());
    playUci(chess, wrongMove);
    return chess.fen();
  }, [game, wrongMove]);

  const canMove =
    status === "playing" && visible === target.length && !wrongMove && !promotion &&
    game.turn() === color[0];

  const targets = useMemo(
    () => (selected && canMove ? game.moves({ square: selected as Square, verbose: true }) : []),
    [game, selected, canMove]
  );

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {};
    const last = wrongMove ?? target[visible - 1];
    if (last) for (const sq of squares(last)) styles[sq] = wrongMove ? WRONG : LAST_MOVE;
    if (selected && canMove) styles[selected] = SELECTED;
    for (const move of targets) styles[move.to] = move.captured ? CAPTURE : TARGET;
    return styles;
  }, [target, visible, wrongMove, selected, canMove, targets]);

  function submit(uci: string) {
    setSelected(null);
    setPromotion(null);
    const verdict = judgeMove(puzzle, progress.line, uci);
    if (verdict === "illegal") return;
    setLastVerdict(verdict);
    if (verdict === "wrong") {
      setWrongMove(uci);
      onProgress({ ...progress, mistakes: progress.mistakes + 1 });
      return;
    }
    // Shows the player's move at once; the reply follows after MOVE_DELAY_MS.
    setShown(visible + 1);
    onProgress({ ...progress, line: [...progress.line, uci] });
  }

  /** Tries the move from → to; returns whether it was legal. Promotions ask for a piece first. */
  function tryMove(from: string, to: string): boolean {
    if (!canMove) return false;
    const moves = game.moves({ square: from as Square, verbose: true }).filter((m) => m.to === to);
    if (moves.length === 0) return false;
    if (moves.some((m) => m.promotion)) {
      setPromotion({ from, to });
      return false;
    }
    submit(from + to);
    return true;
  }

  function handleSquareClick(square: string) {
    if (!canMove) return;
    if (selected && selected !== square && tryMove(selected, square)) return;
    if (promotion) return;
    const piece = game.get(square as Square);
    setSelected(piece && piece.color === color[0] && selected !== square ? square : null);
  }

  let message: string;
  if (status === "solved") {
    message = `Solved! +${puzzlePoints(puzzle, tier, progress)} points.`;
  } else if (status === "revealed") {
    message = "Solution: " + solutionText(puzzle);
  } else if (lastVerdict === "wrong") {
    message = `Not the best move. Try again (−${mistakePenalty(tier)}).`;
  } else if (lastVerdict === "correct") {
    message = "Correct! Keep going.";
  } else {
    const side = color === "white" ? "White" : "Black";
    message = puzzle.mateIn ? `${side} to move: mate in ${puzzle.mateIn}.` : `${side} to move: find the best move.`;
  }

  const tone =
    status === "solved"
      ? "bg-green-100 dark:bg-green-950 text-green-900 dark:text-green-200"
      : lastVerdict === "wrong" && status === "playing"
        ? "bg-red-100 dark:bg-red-950 text-red-900 dark:text-red-200"
        : "bg-blue-50 dark:bg-blue-950/50 text-neutral-800 dark:text-neutral-100";

  return (
    <div className="w-full max-w-[480px] short:max-w-[calc(100dvh-6rem)] mx-auto">
      <div className="relative select-none">
        <Chessboard
          options={{
            id: `puzzle-${puzzle.id}`,
            position: fen,
            boardOrientation: color,
            allowDragging: canMove,
            allowDrawingArrows: true,
            animationDurationInMs: 250,
            squareStyles,
            darkSquareStyle: { backgroundColor: "#b58863" },
            lightSquareStyle: { backgroundColor: "#f0d9b5" },
            boardStyle: { borderRadius: "0.5rem", overflow: "hidden" },
            canDragPiece: ({ piece }) => canMove && piece.pieceType[0] === color[0],
            onPieceDrag: ({ square }) => setSelected(square),
            onPieceDrop: ({ sourceSquare, targetSquare }) => !!targetSquare && tryMove(sourceSquare, targetSquare),
            onSquareClick: ({ square }) => handleSquareClick(square),
          }}
        />
        {promotion && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-lg">
            <div className="flex gap-2 rounded-xl bg-white dark:bg-neutral-900 p-3 shadow-xl">
              {(["q", "r", "b", "n"] as const).map((piece) => {
                const Piece = defaultPieces[`${color[0]}${piece.toUpperCase()}`];
                return (
                  <button
                    key={piece}
                    type="button"
                    onClick={() => submit(promotion.from + promotion.to + piece)}
                    className="size-14 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    aria-label={{ q: "Queen", r: "Rook", b: "Bishop", n: "Knight" }[piece]}
                  >
                    <Piece />
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setPromotion(null)}
                className="px-2 text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 short:mt-1 flex flex-wrap items-center justify-between gap-2">
        <p className={`flex-1 rounded-lg px-3 py-2 short:py-1 text-sm ${tone}`}>{message}</p>
        {status === "playing" && (
          <button
            type="button"
            onClick={() => {
              if (!confirmReveal) return setConfirmReveal(true);
              setConfirmReveal(false);
              onProgress({ ...progress, revealed: true });
            }}
            className="short:hidden px-3 py-1.5 rounded-md text-sm font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
            title="Give up on this puzzle and see the solution (no points for it)"
          >
            {confirmReveal ? "Sure? No points" : "Show solution"}
          </button>
        )}
      </div>
    </div>
  );
}
