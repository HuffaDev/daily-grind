import type { Metadata } from "next";
import AnagramChain from "@/games/anagram-chain/components/AnagramChain";
import { anagramChain } from "@/games/anagram-chain/meta";

export const metadata: Metadata = {
  title: `${anagramChain.name} · Daily Grind`,
  description: anagramChain.tagline,
};

export default function AnagramChainPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black py-8 short:py-0">
      <AnagramChain />
    </main>
  );
}
