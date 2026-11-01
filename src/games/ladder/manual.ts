import type { Manual } from "@/platform/components/GameManual";

export const ladderManual: Manual = {
  short: "Turn the first word into the last word by changing one letter at a time, making a real word every step.",
  steps: [
    { emoji: "▶️", title: "Press Start", text: "You see the start word and the target word. The clock starts." },
    { emoji: "✏️", title: "Change one letter", text: "Type a new 4-letter word that's the same as your last word with exactly one letter changed. COLD → CORD is fine. COLD → CARD is not: that's two changes." },
    { emoji: "⏎", title: "Press Enter", text: "If it's a real word, it's added to your ladder. If not, you'll be told why and it costs nothing." },
    { emoji: "↩️", title: "Changed your mind?", text: "Undo takes back your last word, and Restart takes them all back." },
    { emoji: "🏁", title: "Reach the target", text: "Land on the target word and you're done. Try to do it in the par number of steps." },
  ],
  scoring: [
    "Solving: +400.",
    "Finishing fast: up to +200, shrinking to nothing at 5 minutes.",
    "Each step over par: −40, up to −200.",
    "Give up: 20 points for each letter of your last word that already matches the target.",
  ],
  tips: [
    "Look at which letters already match the target, and try not to change those.",
    "Par is 4 steps on Monday and Tuesday, 5 midweek and 6 at the weekend.",
  ],
};
