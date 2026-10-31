# Which Way

Each day everyone stands in the same city and aims a compass at five other cities. The answer is the direction you'd set off in along the shortest route around the globe, which is often not what a flat map suggests.

- A city scores up to 150 points: full points within 5°, none at 90° or more. A day is worth up to 750.
- Finishing all five counts as a solve. The time only breaks ties.
- It's a [round game](../../platform/roundGame): moves are the aims in compass degrees, they can't be taken back, and the server replays them with `playWhichWay` to get the score.
- The scene is three.js (`components/world.ts`). It only renders when something changes, and the camera never moves, since a moving view made people dizzy in testing.

## Data

`lib/cities.json` and `lib/land.json` come from [Natural Earth](https://www.naturalearthdata.com/), which is public domain. The cities are capitals and very large cities, as `[name, country, lat, lon]`.

Bump `PUZZLE_VERSION` in `meta.ts` if the cities or the selection in `lib/rules.ts` change, since that changes which cities a date gets.
