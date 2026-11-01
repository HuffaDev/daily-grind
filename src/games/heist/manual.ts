import type { Manual } from "@/platform/components/GameManual";

export const heistManual: Manual = {
  short: "Sneak to the 💰, grab it, and get out through the 🚪 without any guard seeing you.",
  steps: [
    { emoji: "▶️", title: "Press Start", text: "You see the map: you, the loot, the exit, walls and guards." },
    { emoji: "🕹️", title: "Move or wait", text: "Each turn, step one square with the arrow keys, WASD or the on-screen buttons, or wait with Space or the wait button." },
    { emoji: "💂", title: "Watch the guards", text: "After your turn, every guard takes a step along its route. Red squares are where a guard can see. Never end up in one." },
    { emoji: "💰", title: "Grab the loot", text: "Walk onto the 💰 to pick it up." },
    { emoji: "🚪", title: "Escape", text: "Get to the 🚪 with the loot and you're done. Backspace or Undo takes back a turn." },
  ],
  scoring: [
    "Escaping with the loot: +400.",
    "Finishing fast: up to +200, shrinking to nothing at 5 minutes.",
    "Each turn over par: −15, up to −200.",
    "Give up: 50 points if you had the loot.",
  ],
  tips: [
    "Guards walk back and forth along a straight line. Learn the pattern, then slip past when they turn around.",
    "Waiting is a move too. Sometimes the best plan is to stand still.",
  ],
};
