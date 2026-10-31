# Word lists

The words Ladder and Anagram Chain share, in `data/words.json`, built by `scripts/build-words.ts` from two downloaded lists:

- **Dictionary**: [ENABLE](https://github.com/dolph/dictionary/blob/master/enable1.txt) (public domain), 3 to 7 letters. Any of these is accepted from players.
- **Common**: [google-10000-english-no-swears](https://github.com/first20hours/google-10000-english), kept only where also in the dictionary. Puzzles and their answers use only these.

Only the server reads the lists (`words.ts`); each game sends its browser just the words its day needs. Rebuilding them can change the puzzle a date gets, so bump `PUZZLE_VERSION` in each word game's `meta.ts` afterwards.
