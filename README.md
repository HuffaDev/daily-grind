# Mini Crossword

A daily 5×5 crossword. Everyone gets the same puzzle each UTC day: it is generated deterministically from the date (see `src/lib/generator.ts`). It runs in a normal browser and as a **Discord Activity**, where each server gets a shared daily leaderboard.

## Scoring

Rules live in `src/lib/scoring.ts`. The browser uses them for instant feedback and the server uses them for the leaderboard.

| | Points |
|---|---|
| Each correct word | 10 × length + rare-letter bonus (D G 1 · B C M P 2 · F H V W Y 3 · K 4 · J X 6 · Q Z 8) |
| Completing without Reveal | +100 |
| Time bonus (on completion) | 200 × (1 − time / 10 min), minimum 0 |
| Check | −5 per wrong cell it flags |
| Reveal | Keeps words already earned; no completion or time bonus |

The server re-scores every submission. A solve's time is the slower of the time the client reports and the play time the server measures from request heartbeats, so editing the client's clock doesn't help.

## Leaderboard

Inside Discord, each server has one leaderboard per puzzle day. It isn't tied to a voice channel or a single Activity session: anyone who opens the Activity in that server that day, at any time, joins the same board. Players who leave stay on it. Each player solves in their own grid, saved under their Discord user ID; only scores are shared. In a DM or group DM, the board belongs to that channel; this needs `DISCORD_BOT_TOKEN` so the server can confirm with Discord that the player is in that DM. Without it, the game still works in DMs but without a leaderboard.

The day, and the board with it, resets at 00:00 UTC. If the Activity is open at the reset, it offers today's puzzle but lets the player finish the one in progress, which still scores on the previous day's board. Boards are deleted after 3 days.

## Development

```bash
npm install
npm run dev
npm test     # scoring, sync and server tests (Vitest)
```

In a normal browser the game runs fully locally. With no Redis configured, the API uses an in-memory store.

## Discord Activity setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. **OAuth2**: copy the client ID and secret, and add any redirect URL (e.g. `https://127.0.0.1`). The portal requires one, but Activities don't use it.
3. **Activities → URL Mappings**:
   - `/` → your deployment's host (e.g. `mini-crossword.vercel.app`)
   - `/discord-cdn` → `cdn.discordapp.com` (needed for leaderboard avatars)
4. **Activities → Settings**: enable Activities.
5. Deploy to Vercel. Add the Upstash Redis integration and set the variables from `.env.example`.

For local testing inside Discord, expose `npm run dev` through a tunnel (e.g. `cloudflared tunnel --url http://localhost:3000`) and point the `/` mapping at it. `next.config.ts` already allows `*.discordsays.com` as a dev origin, which the dev server needs to accept requests coming through Discord.

## Changing the word bank or generator

Any change to `wordbank*.ts`, `patterns.ts` or `generator.ts` changes the puzzle that a given date produces. When you change any of them, bump `PUZZLE_VERSION` in `generator.ts`. Saved progress and leaderboards are keyed by version, so players get a clean reset instead of a mismatched grid. Ideally deploy such changes near 00:00 UTC.
