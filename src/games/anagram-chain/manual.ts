import type { Manual } from "@/platform/components/GameManual";

export const anagramChainManual: Manual = {
  short: "Start with a 3-letter word and add one letter at a time, shuffling the letters to make a longer word each time, up to 7 letters.",
  steps: [
    { emoji: "▶️", title: "Press Start", text: "You see a 3-letter starting word and the day's spare letters." },
    { emoji: "➕", title: "Add one letter", text: "Pick one of the yellow letters, add it to your word, and rearrange them all into a new real word. TIN + A → ANTI." },
    { emoji: "⏎", title: "Press Enter", text: "If it's a real word that uses exactly those letters, it's added. If not, you'll be told why." },
    { emoji: "🔀", title: "Shuffle if stuck", text: "The 🔀 button mixes up the letters so you see them differently. Undo and Restart take words back." },
    { emoji: "7️⃣", title: "Use every letter", text: "Make a 7-letter word with all the letters and you're done." },
  ],
  scoring: [
    "Solving: +400.",
    "Finishing fast: up to +200, shrinking to nothing at 5 minutes.",
    "Give up: 40 points per word you found.",
  ],
  tips: [
    "Try common endings like -ING, -ED and -ER, and starts like RE-.",
    "Any 7-letter word using all the letters wins, not just the one the puzzle had in mind.",
  ],
};
