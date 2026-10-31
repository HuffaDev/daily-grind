import type { Metadata } from "next";
import WhichWayLoader from "@/games/which-way/components/WhichWayLoader";
import { whichWay } from "@/games/which-way/meta";

export const metadata: Metadata = {
  title: `${whichWay.name} · Daily Grind`,
  description: whichWay.tagline,
};

export default function WhichWayPage() {
  return (
    <main className="min-h-screen bg-[#12141c]">
      <WhichWayLoader />
    </main>
  );
}
