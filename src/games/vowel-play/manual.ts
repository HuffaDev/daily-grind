import type { Manual } from "@/platform/components/GameManual";

export const vowelPlayManual: Manual = {
  short: "Ten film and TV titles with all the vowels taken out. Work out what each one is.",
  steps: [
    { emoji: "▶️", title: "Press Start", text: "You see a title with only its consonants, all squashed together, and whether it's a 🎬 film or a 📺 TV show." },
    { emoji: "🔍", title: "Find the words", text: "BRKNGBD is BReaKiNG BaD. Work out where the words split and which vowels go back in." },
    { emoji: "⌨️", title: "Type the full title", text: "Type the whole title and press Enter. Capitals, spaces and punctuation don't matter." },
    { emoji: "⏭️", title: "Can't get it? Pass", text: "Pass skips a title. It costs points, and you'll see the answer at the end." },
    { emoji: "🔟", title: "Do all ten", text: "Guess or pass all ten and you're done. Guesses are final, so there's no undo." },
  ],
  scoring: [
    "Finishing: +400.",
    "Finishing fast: up to +200, shrinking to nothing at 6 minutes.",
    "Each wrong guess: −10. Each pass: −60.",
    "A guess that doesn't use the shown letters in order is turned away for free.",
    "Give up: 30 points per title you got.",
  ],
  tips: [
    "Y counts as a consonant, so it stays in: SKYFLL is Skyfall.",
    "Say the letters out loud. Your mouth fills in the vowels for you.",
  ],
};
