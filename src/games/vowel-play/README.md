# Vowel Play

Ten films and TV shows a day with their vowels taken out: work out each title from what's left. Everyone gets the same ten each UTC day.

Each title shows only its consonants, in capitals, with no gaps between the words, and whether it's a 🎬 film or a 📺 TV show: `BRKNGBD` is *Breaking Bad*, `SPDRMN` is *Spider-Man*. Working out where the words split is part of the puzzle. Type the whole title. Case, spaces and punctuation don't matter, but a guess has to use the shown letters in order, so `better call saul` for `BRKNGBD` is turned away as "Those letters don't match" and costs nothing. A guess that fits but is wrong (`broking bed`) costs points, and so does passing. Guesses are final: there's no Undo.

The day is solved once every title has been guessed or passed. Afterwards, the page lists all ten answers.

## Scoring

Built on the shared step engine (`src/platform/stepGame`), with `noTakebacks` set.

| | Points |
|---|---|
| Solving (every title guessed or passed) | +400 |
| Time bonus | 200 × (1 − time / 6 min), minimum 0 |
| Each pass | −60 |
| Each wrong guess | −10 |
| Giving up | +30 per title guessed so far; no solve or time bonus |

A clean ten in two minutes scores about 530. Passing everything scores 0.

## The titles

`lib/titles.ts` lists about 490 films and shows. The generator shuffles them into a deck and deals ten a day, so no title comes back until the whole list has been used; then it reshuffles. **Adding or removing titles changes every day's puzzle, so bump `PUZZLE_VERSION` in `meta.ts`.** The tests check every title is usable: plain characters (no `&` or accents), at most 32 characters, at least 4 consonants (so `Jaws` → `JWS` is out), and none listed twice.

The puzzle sent to the browser carries only a salted hash of each answer, never the titles. The answers come from the API's `reveal=1`, which the page asks for once you've finished.

## Layout

| Path | What's there |
|---|---|
| `meta.ts` | Name, emoji and `PUZZLE_VERSION`, as listed in the game registry |
| `lib/rules.ts` | Stripping vowels, cleaning and checking guesses, `VOWEL_PLAY_RULES` |
| `lib/titles.ts` | The films and TV shows (server-only) |
| `lib/generator.ts` | Deals the day's ten |
| `components/VowelPlay.tsx` | The clue card, guess box and results, inside the shared `StepGameShell` |
| `server.ts` | The `StepGameDef` the API route at `/api/games/vowel-play` runs |
