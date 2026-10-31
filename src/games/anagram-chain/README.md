# Anagram Chain

Grow a 3-letter word into a 7-letter one. Each step adds one of the day's letters and rearranges into a new word: TIN → ANTI → GIANT → ACTING → COATING. Everyone gets the same letters each UTC day.

The day's final word and one full chain are common English words (`src/games/shared/words`), so it can always be solved without an obscure word; players may use any word in the dictionary. Any 7-letter word that uses all the letters finishes it.

Type a word and press Enter; Undo and Restart take words back, and 🔀 shuffles the letters. After finishing, the page shows a chain for the day.

## Scoring

Built on the shared step engine (`src/platform/stepGame`).

| | Points |
|---|---|
| Solving | +400 |
| Time bonus | 200 × (1 − time / 5 min), minimum 0 |
| Giving up | +40 per word found; no solve or time bonus |

## Layout

| Path | What's there |
|---|---|
| `meta.ts` | Name, emoji and `PUZZLE_VERSION`, as listed in the game registry |
| `lib/rules.ts` | `ANAGRAM_RULES`: which words are allowed and scoring; shared with the browser |
| `lib/generator.ts` | Picks the day's letters and chain on the server (needs the word lists) |
| `components/AnagramChain.tsx` | The letters, chain and word entry, inside the shared `StepGameShell` |
| `server.ts` | The `StepGameDef` the API route at `/api/games/anagram-chain` runs |
