# Picture Logic

A daily 10×10 nonogram. Each row's and column's clue lists the runs of filled cells in it, in order; filling the right cells draws a small picture. Everyone gets the same puzzle each UTC day; it is generated from the date (see `lib/generator.ts`).

The pictures are left–right symmetric pixel sprites: random cells, smoothed into blobs and mirrored. Every puzzle solves with line-by-line logic alone, the way people solve nonograms, which also means it has exactly one solution. Of the first eight random sprites that qualify (36–62 filled cells, at most two blank lines), the day gets the one that takes the most rounds of logic to solve. A heart is kept as a fallback in case none qualifies; the tests check that never happens over a year of dates.

Tap or click to fill a cell, or switch to **✕ Cross** to mark cells you know are empty (right-click also crosses). Dragging paints along the row or column it heads in, only over cells that held what the first one did, so a fill drag doesn't wipe out crosses. A clue greys out once its line matches it.

## Scoring

Built on the shared grid engine (`src/platform/gridGame`), so the browser and the server score the same way. Crosses are only notes: a crossed cell counts the same as an empty one.

| | Points |
|---|---|
| Solving without Reveal | +450 |
| Time bonus (on solving) | 200 × (1 − time / 15 min), minimum 0 |
| Check | −5 per wrong cell it flags (a filled cell that should be empty, or a crossed one that should be filled) |
| Reveal | +5 per cell you'd filled correctly; no solve or time bonus |

Results shared to a channel never draw the picture, so they don't spoil it for anyone yet to play.

## Layout

| Path | What's there |
|---|---|
| `meta.ts` | Name, emoji and `PUZZLE_VERSION`, as listed in the game registry |
| `lib/generator.ts` | Sprite generation, clues, the line solver, and `PICTURE_RULES` (values and scoring) |
| `components/PictureLogic.tsx` | The grid, clues and drag painting, inside the shared `GridGameShell` |
| `server.ts` | The `GridGameDef` the API route at `/api/games/picture-logic` runs |

Any change to `lib/generator.ts` changes the puzzle a date produces: bump `PUZZLE_VERSION` in `meta.ts`, ideally near 00:00 UTC.
