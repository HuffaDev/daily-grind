# Mini Sudoku

A daily 6×6 sudoku: fill the grid so every row, column and 2×3 box holds 1–6 once. Everyone gets the same puzzle each UTC day; it is generated from the date (see `lib/generator.ts`).

Every puzzle solves with only "naked" and "hidden" singles, so it never needs guessing and has exactly one solution. Difficulty follows the week, as the number of clues: 14 on Monday, then 13, 12, 12, 11, 11, and 10 on Sunday. When removing clues can't reach the target while staying solvable this way, the puzzle keeps a clue or two more.

Select a cell, then type 1–6 or use the number pad; Backspace, Delete or 0 clears it, and the arrow keys move.

## Scoring

Built on the shared grid engine (`src/platform/gridGame`), so the browser and the server score the same way.

| | Points |
|---|---|
| Solving without Reveal | +450 |
| Time bonus (on solving) | 200 × (1 − time / 10 min), minimum 0 |
| Check cell / Check grid | −10 per wrong digit it flags; correct ones turn green and lock |
| Reveal | +10 per cell you'd filled correctly; no solve or time bonus |

Timing works like the crossword's: the slower of the client's clock and the play time the server measures. The board stays hidden until **Start**, which starts the clock.

## Layout

| Path | What's there |
|---|---|
| `meta.ts` | Name, emoji and `PUZZLE_VERSION`, as listed in the game registry |
| `lib/generator.ts` | Grid generation, the singles solver, and `SUDOKU_RULES` (values and scoring) |
| `components/MiniSudoku.tsx` | The grid, number pad and keyboard input, inside the shared `GridGameShell` |
| `server.ts` | The `GridGameDef` the API route at `/api/games/sudoku` runs |

Any change to `lib/generator.ts` changes the puzzle a date produces: bump `PUZZLE_VERSION` in `meta.ts`, ideally near 00:00 UTC.
