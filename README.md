# Daily Grind

Daily puzzles and games for Discord. Each game has a new puzzle every UTC day, the same for everyone. It runs in a normal browser and as a **Discord Activity**: players open it, pick a game, and each server gets shared leaderboards per game plus one **Daily Grind** board across all of them. A **bot** opens it with `/play`, shows the boards in chat with `/leaderboard`, and announces each day's puzzles in a channel of the server's choosing.

| Game | Folder |
|---|---|
| 📝 Mini Crossword: a 5×5 crossword | [`src/games/crossword`](src/games/crossword/README.md) |

## How it's organized

It's one Next.js app. Code shared by every game lives in `src/platform/`; each game gets its own folder under `src/games/`.

```text
src/
  app/                    Next.js routes, kept thin
    page.tsx              the hub: game picker + Daily Grind leaderboard
    crossword/page.tsx    one page per game
    api/
      token/              Discord sign-in (shared)
      avatar/             Discord avatar proxy (shared)
      leaderboard/        ?game=…&puzzleId=… · all-time?game=… · global
      games/crossword/    each game's own API
      discord/interactions/  the bot's slash commands and buttons
      cron/daily/         the daily post, run by Vercel Cron
  bot/                    the Discord bot
    commands.ts           slash command definitions
    interactions.ts       what each command and button does
    messages.ts           leaderboard and daily-post messages
    daily.ts              sends the daily post to every subscribed server
    discord.ts            request signatures, REST calls as the bot
  platform/               shared by every game
    daily.ts              UTC date keys, seeded RNG, puzzle ids ("2026-10-31.v1")
    stats.ts              per-game local stats (best time, streak)
    discordClient.ts      Discord SDK handshake and API calls
    useDiscordConnection.ts
    components/           Hub, leaderboards, share button, countdown, theme toggle
    server/
      store.ts            Redis / Upstash / in-memory storage, namespaced by game
      session.ts          signed session issued after Discord sign-in
      games.ts            GameError, active-puzzle check, anti-cheat play time
      leaderboard.ts      daily, all-time and global boards
      standings.ts        all-time and global totals
      webhook.ts          optional results webhook
  games/
    registry.ts           the list of games
    crossword/            everything specific to the crossword
```

The rule of thumb: `src/platform` never imports from a game folder, except the registry. A game imports from `src/platform`, never from another game.

## Leaderboards

Inside Discord, each server has one leaderboard per game per puzzle day. It isn't tied to a voice channel or a single Activity session: anyone who opens the Activity in that server that day, at any time, joins the same board. Players who leave stay on it. Each player plays their own game, saved under their Discord user ID; only scores are shared. In a DM or group DM, the board belongs to that channel; this needs `DISCORD_BOT_TOKEN` so the server can confirm with Discord that the player is in that DM. Without it, games still work in DMs but without leaderboards.

The day, and the boards with it, resets at 00:00 UTC. Yesterday's puzzle still accepts play, so a game in progress at the reset can be finished; it scores on the previous day's board.

Daily boards are kept forever. Each game's **All time** tab totals them per server: points, puzzles solved out of played (✅), wins (🏆, days a player topped the board with a solve, not counting today), best time (⚡) and current solve streak (🔥). Each player's in-progress game is only kept for 3 days.

The **Daily Grind** board on the hub adds up every game: total points, solves, wins, and a streak of days in a row with at least one game solved. Points from different games are simply added, so keep each game's scoring on a similar scale; a crossword solve is worth about 520–740, around 600 for a three-minute solve.

## The bot

| Command | What it does | Who can use it |
|---|---|---|
| `/play` | Opens the Activity | Everyone |
| `/leaderboard [game]` | Posts the server's Daily Grind standings, or today's board for one game | Everyone |
| `/daily set channel` | Posts today's puzzles in that channel now, then every day at 00:00 UTC | Manage Server |
| `/daily stop` | Stops the daily posts | Manage Server |

Every bot message has a **Play** button that opens the Activity for whoever presses it. The daily post lists the games and the server's top three solvers of each from the day before. Board posts show names without pinging anyone.

The bot runs inside the same Next.js app: Discord sends commands to `/api/discord/interactions` as HTTP requests, so there's no always-on process to host. Vercel Cron calls `/api/cron/daily` at 00:00 UTC (`vercel.json`). Each server gets one post a day even if the job runs twice. If a server deletes its channel, its daily posts are turned off; if the bot just lacks permission there, it keeps trying each day.

### Results webhook (optional)

Set `RESULTS_WEBHOOK_URL` to have the server POST each player's first solve of a puzzle (revealed or given-up games don't count), for example to a Discord bot that keeps its own stats:

```json
{ "game": "crossword", "user_id": "123…", "date": "2026-10-31", "solve_time_secs": 196, "points": 601 }
```

If `RESULTS_WEBHOOK_TOKEN` is set, it is sent as `Authorization: Bearer <token>`. Delivery is best effort: if the receiver is down, the solve isn't retried, and the game carries on.

## Adding a game

1. **Create `src/games/<id>/meta.ts`** exporting a `GameInfo` (`id`, `name`, `tagline`, `emoji`, `puzzleVersion`, and `summarizeToday`, which turns a board row into a short summary like "✅ 1:23"), and add it to `GAMES` in `src/games/registry.ts`. The id becomes the URL and the storage namespace, so don't change it after release. The hub, the leaderboards, the daily post and `/leaderboard` all pick the game up from the registry. Run `bun run register-commands` afterwards so `/leaderboard` offers it.
2. **Make the daily puzzle deterministic.** Seed it with `mulberry32(seedForDateKey(dateKey))` from `src/platform/daily.ts`, and identify it with `getPuzzleId(dateKey, PUZZLE_VERSION)`.
3. **Write the server side** in `src/games/<id>/server/`. For each request: check the puzzle with `resolveActivePuzzle`, take the player's lock with `getStore().withGameLock(...)`, load and save your own record with `getGame` / `saveGame`, and post the player's row with `upsertEntry`. A `BoardEntry` needs `points`, `solvedTimeSeconds` (null until solved) and a `detail` object of your own. If the game is timed, add `PlayTime` to your record and score with `scoredSeconds`. Call `reportSolve` on the first solve. Never trust the client's score: recompute it on the server.
4. **Add the API route** at `src/app/api/games/<id>/route.ts`, like the crossword's. The client reaches it with `postGameAction(connection, "<id>", body)`.
5. **Build the UI** in `src/games/<id>/components/` and add `src/app/<id>/page.tsx`. Get the Discord session from `useDiscordConnection()`, render `<Leaderboard game={…} />` once connected, link home with `<LaunchLink href="/">`, and keep local stats with `loadStats("<id>", …)` / `recordGame`.
6. **Test it**: put game logic in pure functions next to `*.test.ts` files; `bun test` picks them up. `src/games/crossword/server/game.test.ts` shows how to test the server side against the in-memory store.

Links between pages must be `LaunchLink`s: Discord passes launch parameters in the query string, and a plain `Link` drops them.

## Development

The project uses [Bun](https://bun.com) 1.4 for everything: installing, scripts, tests, and as the runtime on Vercel (`bunVersion` in `vercel.json`). The `--bun` flag in the `package.json` scripts makes Next.js run on Bun instead of Node.

```bash
bun install
bun run dev
bun test     # scoring, sync, leaderboard and server tests
```

On Windows, `start-app.cmd` and `stop-app.cmd` run the dev server in the background instead, with its output in `dev.log`. They read settings from a `local.env` file next to them, with the same names as `.env.example`; it is gitignored. Without `SESSION_SECRET` there, a random one is used for each run.

In a normal browser every game runs fully locally. With no Redis configured, the API uses an in-memory store. To also run the Redis store tests, point `TEST_REDIS_URL` at a disposable database, e.g. `TEST_REDIS_URL=redis://127.0.0.1:6379/15 bun test`.

## Discord setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. **General Information**: copy the **Public Key** into `DISCORD_PUBLIC_KEY`.
3. **OAuth2**: copy the client ID and secret, and add any redirect URL (e.g. `https://127.0.0.1`). The portal requires one, but Activities don't use it.
4. **Bot**: reset the token and copy it into `DISCORD_BOT_TOKEN`. The bot needs no privileged intents.
5. **Activities → URL Mappings**:
   - `/` → your deployment's host (e.g. `daily-grind.vercel.app`). That's the only mapping needed; every game is a path under it, and avatars are served through `/api/avatar`.
6. **Activities → Settings**: enable Activities.
7. Add storage. Without it, scores and the bot's settings live in memory: on Vercel each server instance has its own copy, so they go missing between requests and are lost on every deploy. Set **one** of:
   - **Upstash Redis**: in the Vercel project, open **Storage → Create Database → Upstash for Redis** and connect it to all environments. It sets `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or the `UPSTASH_REDIS_REST_*` names).
   - **Your own Redis server**: set `REDIS_URL` (e.g. `rediss://:password@host:6379/1`). `REDIS_KEY_PREFIX` is optional. It adds a prefix to every key, so a shared server can limit this app to its own keys with a Redis ACL.
8. Deploy to Vercel and set the variables from `.env.example`, including a random `CRON_SECRET`. Redeploy after adding variables so they take effect.
9. **General Information → Interactions Endpoint URL**: `https://<your host>/api/discord/interactions`. Discord checks the endpoint when you save, so deploy (with `DISCORD_PUBLIC_KEY` set) first.
10. Register the slash commands: fill in `local.env` and run `bun run register-commands`. Run it again whenever `src/bot/commands.ts` or the list of games changes.
11. **Installation**: under Guild Install, add the scopes `applications.commands` and `bot` with the permissions **View Channels**, **Send Messages** and **Embed Links**, then use the install link to add Daily Grind to a server.

For local testing inside Discord, expose `bun run dev` through a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and point the `/` mapping at it. `next.config.ts` already allows `*.discordsays.com` as a dev origin, which the dev server needs to accept requests coming through Discord.
