import type { Metadata } from "next";
import Heist from "@/games/heist/components/Heist";
import { heist } from "@/games/heist/meta";

export const metadata: Metadata = {
  title: `${heist.name} · Daily Grind`,
  description: heist.tagline,
};

export default function HeistPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black py-8 short:py-0">
      <Heist />
    </main>
  );
}
