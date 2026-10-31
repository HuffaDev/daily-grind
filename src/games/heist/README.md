# Daily Heist

Sneak through a 7×7 map, grab the 💰 and reach the 🚪 without a guard seeing you. Everyone gets the same map each UTC day.

Each turn you step or wait, then every guard takes a step along its beat, pacing a short straight corridor back and forth. A guard sees its own square and up to two squares the way it's heading, until a wall; those squares show in red. A move that would get you seen, or walk you through a guard, isn't allowed. There are 2 guards early in the week and 3 from Thursday to Sunday.

Every map is checked when it's made: it has a way through, par (the fewest turns, found by searching every turn of the guards' patrols) is at least 12, and the guards make it longer than just walking the route.

Arrow keys or WASD move, Space waits, Backspace undoes; on a phone, use the buttons. After finishing, the page shows a par route.

## Scoring

Built on the shared step engine (`src/platform/stepGame`).

| | Points |
|---|---|
| Solving | +400 |
| Time bonus | 200 × (1 − time / 5 min), minimum 0 |
| Each turn over par | −15, at most −200 |
| Giving up | +50 if you had the loot; no solve or time bonus |

## Layout

| Path | What's there |
|---|---|
| `meta.ts` | Name, emoji and `PUZZLE_VERSION`, as listed in the game registry |
| `lib/heist.ts` | Turns, guards and sight, `HEIST_RULES`, the par search and the map generator |
| `components/Heist.tsx` | The map and controls, inside the shared `StepGameShell` |
| `server.ts` | The `StepGameDef` the API route at `/api/games/heist` runs |
