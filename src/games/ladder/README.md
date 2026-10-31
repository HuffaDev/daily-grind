# Ladder

A daily word ladder: turn the start word into the target, changing one letter per step, with every step a real word. Everyone gets the same ladder each UTC day.

The day's start, target and par come from common English words only (`src/games/shared/words`), so the answer never needs an obscure word, but players may step through any word in the dictionary. Par is the fewest steps using common words, and follows the week: 4 on Monday and Tuesday, 5 Wednesday to Friday, 6 at the weekend. Using a rarer word can beat par; it scores the same as par.

Type a word and press Enter; Undo and Restart take steps back. After finishing, the page shows a par route.

## Scoring

Built on the shared step engine (`src/platform/stepGame`), so the browser and the server score the same way.

| | Points |
|---|---|
| Solving | +400 |
| Time bonus | 200 × (1 − time / 5 min), minimum 0 |
| Each step over par | −40, at most −200 |
| Giving up | +20 per letter of the last word already matching the target; no solve or time bonus |

## Layout

| Path | What's there |
|---|---|
| `meta.ts` | Name, emoji and `PUZZLE_VERSION`, as listed in the game registry |
| `lib/rules.ts` | `LADDER_RULES`: which steps are allowed, par and scoring; shared with the browser |
| `lib/generator.ts` | Picks the day's ladder on the server (needs the word lists) |
| `components/Ladder.tsx` | The ladder and word entry, inside the shared `StepGameShell` |
| `server.ts` | The `StepGameDef` the API route at `/api/games/ladder` runs |
