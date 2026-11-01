import type { Manual } from "@/platform/components/GameManual";

export const whichWayManual: Manual = {
  short: "You're standing in one city holding a compass. Point it at five other cities around the world.",
  steps: [
    { emoji: "📍", title: "See where you are", text: "The top says which city you're standing in, and which city to aim at." },
    { emoji: "🧭", title: "Aim the compass", text: "Drag on the compass to turn the needle toward that city." },
    { emoji: "🔒", title: "Lock it in", text: "Press Lock it in. You'll see the right direction next to yours." },
    { emoji: "5️⃣", title: "Do all five", text: "Every day has five cities to aim at." },
  ],
  scoring: [
    "Each city is worth up to 150 points: full points within 5°, nothing if you're 90° or more off.",
    "A perfect day is 750.",
    "Your time only matters to break ties.",
  ],
  tips: [
    "The right answer is the shortest route around the globe, which often isn't what a flat map shows.",
    "Paris to Tokyo sets off north-east over Russia, not east.",
  ],
};
