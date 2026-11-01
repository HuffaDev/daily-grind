import type { Manual } from "@/platform/components/GameManual";

export const chessManual: Manual = {
  short: "Three chess puzzles: find the best move in each one. The board plays the other side.",
  steps: [
    { emoji: "▶️", title: "Press Start", text: "The clock starts and the first puzzle appears. The board shows whether you're playing White or Black." },
    { emoji: "♟️", title: "Make the best move", text: "Drag a piece, or tap it and then tap where it goes. Look for checks, captures and threats first." },
    { emoji: "🔁", title: "Keep going", text: "When you're right, the board answers with the opponent's reply. Some puzzles need a few moves in a row." },
    { emoji: "❌", title: "Wrong move? Try again", text: "A wrong move is taken back and you go again, but it costs points." },
    { emoji: "3️⃣", title: "Do all three", text: "Easy, then medium, then hard. Press Next puzzle after each one." },
  ],
  scoring: [
    "Solving a puzzle: Easy 100, Medium 150, Hard 200.",
    "Each wrong move takes away a third of that puzzle's points.",
    "Solving all three without Show solution: +100.",
    "Finishing fast: up to +200, shrinking to nothing at 10 minutes.",
    "Show solution gives up that puzzle: no points for it, and no bonuses for the day.",
  ],
  tips: [
    "Any checkmate counts, even if it's not the move the puzzle had in mind.",
  ],
};
