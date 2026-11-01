import type { Manual } from "@/platform/components/GameManual";

export const fiveCluesManual: Manual = {
  short: "Name a person, a country and an animal, using as few clues as you can.",
  steps: [
    { emoji: "🔎", title: "Read the first clue", text: "Each one starts with a single clue, the hardest one." },
    { emoji: "⌨️", title: "Guess", text: "Start typing and pick a name from the list." },
    { emoji: "➡️", title: "Wrong? Get another clue", text: "A wrong guess shows the next, easier clue. Next clue shows it without guessing." },
    { emoji: "3️⃣", title: "Do all three", text: "Person, then country, then animal. Each has up to five clues." },
  ],
  scoring: [
    "Right on the first clue: 250 points. Each extra clue takes 50 off.",
    "Missing after all five clues scores nothing for that one.",
    "A perfect day is 750.",
  ],
  tips: [
    "A guess you're unsure of still shows the next clue, the same as Next clue would, but it might just be right.",
  ],
};
