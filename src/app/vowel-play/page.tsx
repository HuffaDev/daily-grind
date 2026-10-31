import type { Metadata } from "next";
import VowelPlay from "@/games/vowel-play/components/VowelPlay";
import { vowelPlay } from "@/games/vowel-play/meta";

export const metadata: Metadata = {
  title: `${vowelPlay.name} · Daily Grind`,
  description: vowelPlay.tagline,
};

export default function VowelPlayPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black py-8 short:py-0">
      <VowelPlay />
    </main>
  );
}
