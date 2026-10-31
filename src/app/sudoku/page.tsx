import type { Metadata } from "next";
import MiniSudoku from "@/games/sudoku/components/MiniSudoku";
import { sudoku } from "@/games/sudoku/meta";

export const metadata: Metadata = {
  title: `${sudoku.name} · Daily Grind`,
  description: sudoku.tagline,
};

export default function SudokuPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-black py-8 short:py-0">
      <MiniSudoku />
    </main>
  );
}
