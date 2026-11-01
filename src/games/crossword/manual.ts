import type { Manual } from "@/platform/components/GameManual";

export const crosswordManual: Manual = {
  short: "Fill every white square with letters so each answer matches its clue, across and down.",
  steps: [
    { emoji: "👆", title: "Tap a square", text: "The clue for that word lights up at the top. Tap the same square again to switch between across and down." },
    { emoji: "⌨️", title: "Type letters", text: "Each letter moves you to the next square. Backspace deletes, and the arrow keys move around." },
    { emoji: "🔢", title: "Use the clue list", text: "Tap any clue in the Across or Down list to jump straight to that word." },
    { emoji: "🤔", title: "Stuck? Check it", text: "Check letter or Check word marks wrong letters red. Right letters turn green and lock in place." },
    { emoji: "🎉", title: "Fill the whole grid", text: "Get every letter right and you're done. The clock stops and your score goes on the board." },
  ],
  scoring: [
    "Every word you get right: 10 points per letter, plus a little extra for rare letters like J, Q, X and Z.",
    "Finishing without Reveal: +100.",
    "Finishing fast: up to +200, shrinking to nothing at 10 minutes.",
    "Check costs 5 points per wrong letter it finds.",
    "Reveal shows the whole answer, but you keep only the words you'd already got, with no bonuses.",
  ],
  tips: [
    "Start with the clues you're sure of. Their letters help with the words that cross them.",
    "A blank in a clue, like \"Welcome ___\", means the answer fills the gap.",
  ],
};
