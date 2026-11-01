import type { Manual } from "@/platform/components/GameManual";

export const spectrumManual: Manual = {
  short: "Put three things on a scale where you think everyone in your server would put them. Closest to the average wins.",
  steps: [
    { emoji: "👀", title: "Read the round", text: "You get a thing, like Pizza, and a scale between two ends, like Overrated and Underrated." },
    { emoji: "🎚️", title: "Place your mark", text: "Slide the marker to where you think it belongs." },
    { emoji: "🔒", title: "Lock in", text: "Press Lock in. You can't change it after that." },
    { emoji: "3️⃣", title: "Do all three", text: "There are three rounds a day." },
    { emoji: "📊", title: "See how you did", text: "Afterwards you see your server's average for each round next to your mark." },
  ],
  scoring: [
    "Each round is worth up to 200 points: the closer to your server's average, the more you get.",
    "Missing by 40 or more on the 0–100 scale scores nothing for that round.",
    "Your points change as more people play, because every new player moves the average.",
  ],
  tips: [
    "It's not about what you think. It's about what your friends think.",
    "The first player each day matches the average exactly, so play early for a moment of glory.",
  ],
};
