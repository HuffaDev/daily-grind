import type { Metadata } from "next";
import PictureLogic from "@/games/picture-logic/components/PictureLogic";
import { pictureLogic } from "@/games/picture-logic/meta";

export const metadata: Metadata = {
  title: `${pictureLogic.name} · Daily Grind`,
  description: pictureLogic.tagline,
};

export default function PictureLogicPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black py-8 short:py-0">
      <PictureLogic />
    </main>
  );
}
