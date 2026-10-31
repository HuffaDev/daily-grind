import type { Metadata } from "next";
import FiveCluesLoader from "@/games/five-clues/components/FiveCluesLoader";
import { fiveClues } from "@/games/five-clues/meta";

export const metadata: Metadata = {
  title: `${fiveClues.name} · Daily Grind`,
  description: fiveClues.tagline,
};

export default function FiveCluesPage() {
  return (
    <main className="min-h-screen bg-[#12141c]">
      <FiveCluesLoader />
    </main>
  );
}
