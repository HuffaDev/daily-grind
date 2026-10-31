import type { Metadata } from "next";
import DailyChess from "@/games/chess/components/DailyChess";
import { chess } from "@/games/chess/meta";

export const metadata: Metadata = {
  title: `${chess.name} · Daily Grind`,
  description: chess.tagline,
};

export default function ChessPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black py-8 short:py-0">
      <DailyChess />
    </main>
  );
}
