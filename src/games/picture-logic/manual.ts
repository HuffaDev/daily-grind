import type { Manual } from "@/platform/components/GameManual";

export const pictureLogicManual: Manual = {
  short: "Fill in the right squares to draw a hidden picture, using the numbers beside each row and column.",
  steps: [
    { emoji: "▶️", title: "Press Start", text: "The clock starts and the empty 10×10 grid appears." },
    { emoji: "🔢", title: "Read the numbers", text: "The numbers next to a row say how many filled squares are in it, in groups. \"3 1\" means a group of 3, then a gap of at least one, then a group of 1." },
    { emoji: "■", title: "Fill squares", text: "With ■ Fill selected, tap a square to fill it. Drag to fill a line of squares." },
    { emoji: "✕", title: "Cross out empty ones", text: "Switch to ✕ Cross, or right-click, to mark squares you know are empty. Crosses are only notes for you." },
    { emoji: "🖼️", title: "Finish the picture", text: "When every row and column matches its numbers, the picture appears and you're done. Numbers fade once their line is right." },
  ],
  scoring: [
    "Solving without Reveal: +450.",
    "Finishing fast: up to +200, shrinking to nothing at 15 minutes.",
    "Check costs 5 points per wrong square it finds.",
    "Reveal gives 5 points per square you'd already filled correctly, and no other points.",
  ],
  tips: [
    "Start with big numbers. In a row of 10, a 7 must cover the middle 4 squares, wherever it starts.",
    "A 0 means the whole line is empty: cross it all out.",
  ],
};
