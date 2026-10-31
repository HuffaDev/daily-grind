# Spectrum

Three rounds a day: place a thing on a scale, like **Pizza** between *Overrated* and *Underrated*. You don't score for being right; you score for landing close to the **average of everyone in your server** who played that day. So it's about reading the room.

Everyone gets the same rounds each UTC day. Subjects come from a fixed shuffled list and don't repeat until all have been used; each day pairs them with three different scales.

Marks are final once the third is locked in. The server's averages stay hidden until you've played, then show under your marks. Every new player shifts the averages, so everyone's points in that server are rescored as people play; the leaderboard shows each player's average miss (🎯). Outside Discord the game shows your marks only.

## Scoring

| | Points |
|---|---|
| Each round | 200 × (1 − miss / 40), minimum 0, where miss is the distance from the server's average on a 0–100 scale |

The first player of the day matches the average exactly, so starts at 600.

## Layout

| Path | What's there |
|---|---|
| `meta.ts` | Name, emoji and `PUZZLE_VERSION`, as listed in the game registry |
| `lib/rounds.ts` | Scales, subjects, the day's rounds, and scoring |
| `server/game.ts` | Saves marks, keeps each server's marks, and rescores its board |
| `components/Spectrum.tsx` | The rounds and results |
