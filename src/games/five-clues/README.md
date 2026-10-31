# Five Clues

Each day has a person, a country and an animal to name. You start with one clue, the hardest. A wrong guess or **Next clue** shows the next one.

- A right answer scores 250 on the first clue, then 50 less for each clue after that. Missing all five scores nothing. A day is worth up to 750.
- Finding all three counts as a solve. Finishing with a miss keeps its points but doesn't count as a solve, like a revealed puzzle in the other games.
- It's a [round game](../../platform/roundGame): moves are guesses, or `null` for asking for the next clue. They can't be taken back, and the server replays them with `playFiveClues` to get the score.

## Writing puzzles

`lib/content.ts` holds the puzzles and the names the guess box offers. Keep clues hardest first, and don't name the answer in one. The tests check that every answer is on its guess list, and that no clue contains its own answer.

The guess lists include plenty of names that are never answers, so the suggestions don't give the answers away.

Bump `PUZZLE_VERSION` in `meta.ts` when puzzles change, since that changes what a date gets.
