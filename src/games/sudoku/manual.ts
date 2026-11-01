import type { Manual } from "@/platform/components/GameManual";

export const sudokuManual: Manual = {
  short: "Fill the 6×6 grid so every row, every column and every 2×3 box has the numbers 1 to 6 exactly once.",
  steps: [
    { emoji: "▶️", title: "Press Start", text: "The clock starts and the grid appears. The bold numbers are given and can't change." },
    { emoji: "👆", title: "Pick a square", text: "Tap an empty square. Its row, column and box light up so you can see what's already used." },
    { emoji: "🔢", title: "Put in a number", text: "Tap 1 to 6 on the number pad, or type it. Backspace or 0 clears it." },
    { emoji: "🧠", title: "Look for the only option", text: "If a square can only be one number, that's the answer. If a number can only go in one place in a row, column or box, put it there." },
    { emoji: "🎉", title: "Fill every square", text: "Get the whole grid right and you're done." },
  ],
  scoring: [
    "Solving without Reveal: +450.",
    "Finishing fast: up to +200, shrinking to nothing at 10 minutes.",
    "Check cell or Check grid costs 10 points per wrong number it finds. Right ones turn green and lock.",
    "Reveal gives 10 points per square you'd already got right, and no other points.",
  ],
  tips: [
    "You never need to guess. Every puzzle can be solved by working it out step by step.",
    "It gets harder through the week: Monday is easiest, Sunday is hardest.",
  ],
};
