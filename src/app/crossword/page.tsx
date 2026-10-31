import type { Metadata } from "next";
import Crossword from "@/games/crossword/components/Crossword";
import { crossword } from "@/games/crossword/meta";

export const metadata: Metadata = {
  title: `${crossword.name} · Daily Grind`,
  description: crossword.tagline,
};

export default function CrosswordPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black py-8 short:py-0">
      <Crossword />
    </main>
  );
}
