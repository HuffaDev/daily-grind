import type { Metadata } from "next";
import Ladder from "@/games/ladder/components/Ladder";
import { ladder } from "@/games/ladder/meta";

export const metadata: Metadata = {
  title: `${ladder.name} · Daily Grind`,
  description: ladder.tagline,
};

export default function LadderPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black py-8 short:py-0">
      <Ladder />
    </main>
  );
}
