# Daily Chess

Three chess puzzles a day, easy, medium and hard, the same for everyone each UTC day. Find the best move; the board plays the opponent's replies. The board stays hidden behind a **Start** button until the player starts the clock.

Puzzles come from the [Lichess puzzle database](https://database.lichess.org/#puzzles) (CC0). Like on Lichess, any checkmate solves a puzzle, even one the listed solution doesn't use.

## Scoring

Rules live in `lib/scoring.ts`. The browser uses them for instant feedback and the server uses them for the leaderboard.

| | Points |
|---|---|
| Solving a puzzle | Easy 100 · Medium 150 · Hard 200 |
| Each wrong move | −⅓ of that puzzle's points (33 · 50 · 67), down to 0 for the puzzle; the move is taken back and the player tries again |
| Solving all three without Show solution | +100 |
| Time bonus (on solving all three) | 200 × (1 − time / 10 min), minimum 0 |
| Show solution | No points for that puzzle, and no completion or time bonus for the day |

The client sends each puzzle's correct moves so far, its wrong-move count and whether it was revealed. The server replays the moves against the solution, keeps only correct ones, and never lowers a count or undoes a reveal (`mergeProgress`). Time works as in the crossword: the slower of the client's clock and the play time the server measures from heartbeats.

On the leaderboard, a day solved shows ✅ and the time, with ✗ for wrong moves; a day with a revealed puzzle shows 🔎. **Share Result** posts a row per puzzle: 🟥 per wrong move, 🟩 per move found, 🔎 if revealed.

## Layout

| Path | What's there |
|---|---|
| `meta.ts` | Name, emoji and `PUZZLE_VERSION`, as listed in the game registry |
| `components/` | The game UI: `DailyChess` (state, sync, tabs), `PuzzleBoard` (one puzzle's board and moves), win modal |
| `lib/` | Move rules (`solution.ts`), daily selection (`puzzles.ts`, server only), scoring, share text, local progress, API calls |
| `data/puzzles.json` | The puzzle bank: 1,500 per tier, built by the script below |
| `server/game.ts` | The game's API (`sync`, `progress`) at `/api/games/chess`, and the day's puzzles at `/api/games/chess/puzzles` |
| `scripts/build-puzzles.ts` | Rebuilds the bank; never run at build or runtime |

The client fetches only its day's puzzles from the server, so the bank, and every future day's solutions, never ship to the browser.

## The puzzle bank

Each day takes the next puzzle of each tier's pre-shuffled list (`getDailyPuzzles`), so none repeats for 1,500 days (about four years) after launch. `scripts/build-puzzles.ts` picks well-tested puzzles: at least 1,000 plays, popularity 85+, rating deviation ≤ 80, and at most four moves for the player. Tiers are rated 1000–1399, 1500–1899 and 2000–2399.

To rebuild it, download `lichess_db_puzzle.csv.zst` (about 280 MB) from database.lichess.org and run, from the repo root:

```bash
bun src/games/chess/scripts/build-puzzles.ts path/to/lichess_db_puzzle.csv.zst
```

Rebuilding, or changing the tiers or `getDailyPuzzles`, changes which puzzles a date gets: bump `PUZZLE_VERSION` in `meta.ts` so saved progress and leaderboards reset cleanly, ideally near 00:00 UTC.
