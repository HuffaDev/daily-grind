import type { Metadata } from "next";
import Spectrum from "@/games/spectrum/components/Spectrum";
import { spectrum } from "@/games/spectrum/meta";

export const metadata: Metadata = {
  title: `${spectrum.name} · Daily Grind`,
  description: spectrum.tagline,
};

export default function SpectrumPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black py-8 short:py-0">
      <Spectrum />
    </main>
  );
}
