import { GAMES, type GameInfo } from "@/games/registry";
import { getDailyPuzzleNumber, getPuzzleId, previousDateKey } from "@/platform/daily";
import { getDailyBoard, getGlobalBoard } from "@/platform/server/leaderboard";
import { compareEntries } from "@/platform/server/standings";
import { getStore } from "@/platform/server/store";
import { Embed, escapeMarkdown, MessageBody } from "./discord";

/** Button id that launches the Activity (see handleInteraction). */
export const PLAY_BUTTON_ID = "play";

const COLOR = 0xf59e0b;
const EMBED_FIELD_LIMIT = 1024;
const BOARD_SIZE = 10;
const MEDALS = ["🥇", "🥈", "🥉"];

/** A message row with the Play button, which opens the Activity for whoever presses it. */
export function playButton(): unknown[] {
  return [{ type: 1, components: [{ type: 2, style: 1, label: "Play", emoji: { name: "🎮" }, custom_id: PLAY_BUTTON_ID }] }];
}

/** Nicknames can contain markdown and mentions; never let a board post ping anyone. */
const noPings = { parse: [] };

/** Standings across every game for a scope, all time. */
export async function globalBoardMessage(scope: string): Promise<MessageBody> {
  const entries = (await getGlobalBoard(scope)).slice(0, BOARD_SIZE);
  const lines = entries.map((e, i) => {
    const stats = [`✅ ${e.solved}/${e.played}`];
    if (e.wins > 0) stats.push(`🏆 ${e.wins}`);
    if (e.currentStreak > 0) stats.push(`🔥 ${e.currentStreak}`);
    return `**${i + 1}.** ${escapeMarkdown(e.name)} — ${e.points} pts · ${stats.join(" · ")}`;
  });
  return {
    embeds: [
      {
        title: "Daily Grind leaderboard",
        description: lines.join("\n") || "No one has played yet. Press Play to be the first!",
        color: COLOR,
        footer: { text: "All games, all time · 🔥 days in a row with a game solved" },
      },
    ],
    components: playButton(),
    allowed_mentions: noPings,
  };
}

/** A scope's board for today's puzzle of one game. */
export async function gameBoardMessage(scope: string, game: GameInfo, todayKey: string): Promise<MessageBody> {
  const entries = (await getDailyBoard(scope, game, getPuzzleId(todayKey, game.puzzleVersion))).slice(0, BOARD_SIZE);
  const lines = entries.map(
    (e, i) => `**${i + 1}.** ${escapeMarkdown(e.name)} — ${e.points} pts · ${game.summarizeToday(e)}`
  );
  return {
    embeds: [
      {
        title: `${game.emoji} ${game.name} · today`,
        description: lines.join("\n") || `No one has played today's ${game.name} yet.`,
        color: COLOR,
      },
    ],
    components: playButton(),
    allowed_mentions: noPings,
  };
}

/** Yesterday's top solvers of `game` on a scope's board, e.g. "🥇 Ana · 640  🥈 Bo · 610". */
async function yesterdaysBest(scope: string, game: GameInfo, yesterdayKey: string): Promise<string | null> {
  const board = await getStore().getBoard(game.id, getPuzzleId(yesterdayKey, game.puzzleVersion), scope);
  const top = board
    .filter((e) => e.solvedTimeSeconds !== null)
    .sort(compareEntries)
    .slice(0, MEDALS.length);
  if (top.length === 0) return null;
  return top.map((e, i) => `${MEDALS[i]} ${escapeMarkdown(e.name)} · ${e.points}`).join("  ");
}

const PLAYERS_SHOWN = 15;

/** "**Lux**", "**Lux** and **huffa**", or "**Lux**, **huffa** and 2 others". */
function namesList(names: string[]): string {
  const [first, second] = names.map((name) => `**${escapeMarkdown(name)}**`);
  if (names.length === 1) return first;
  if (names.length === 2) return `${first} and ${second}`;
  const others = names.length - 2;
  return `${first}, ${second} and ${others} other${others === 1 ? "" : "s"}`;
}

/**
 * The bot's card in a channel saying who's playing (see playingCard.ts), with
 * a headline like other Activities': "Lux and huffa are playing!", or once
 * everyone has left, "Lux, huffa and 2 others were playing".
 */
export function playingMessage(players: { userId: string; name: string; lastSeenAt: number }[], playing: Set<string>): MessageBody {
  const now = players.filter((p) => playing.has(p.userId));
  const left = players.filter((p) => !playing.has(p.userId)).sort((a, b) => b.lastSeenAt - a.lastSeenAt);
  const headline = now.length
    ? `${namesList(now.map((p) => p.name))} ${now.length === 1 ? "is" : "are"} playing!`
    : `${namesList(left.map((p) => p.name))} ${left.length === 1 ? "was" : "were"} playing`;
  const lines = [
    ...now.map((p) => `🟢 ${escapeMarkdown(p.name)}`),
    ...left.map((p) => `⚪ ${escapeMarkdown(p.name)} · left <t:${Math.floor(p.lastSeenAt / 1000)}:R>`),
  ];
  if (lines.length > PLAYERS_SHOWN) lines.splice(PLAYERS_SHOWN, Infinity, `…and ${lines.length - PLAYERS_SHOWN} more`);
  return {
    content: headline,
    embeds: [{ title: "Daily Grind", description: lines.join("\n"), color: COLOR, footer: { text: "Press Play to join in" } }],
    components: playButton(),
    allowed_mentions: noPings,
  };
}

/** As many whole lines as fit in a Discord embed field. */
function fitField(lines: string[]): string {
  let value = "";
  for (const line of lines) {
    const next = value ? `${value}\n${line}` : line;
    if (next.length > EMBED_FIELD_LIMIT) break;
    value = next;
  }
  return value;
}

/** The post announcing `todayKey`'s puzzles in a server, with its results from the day before. */
export async function dailyMessage(scope: string, todayKey: string): Promise<MessageBody> {
  const yesterdayKey = previousDateKey(todayKey);
  const results = await Promise.all(GAMES.map((game) => yesterdaysBest(scope, game, yesterdayKey)));
  const best = GAMES.flatMap((game, i) => (results[i] ? [`${game.emoji} ${results[i]}`] : []));

  const embed: Embed = {
    title: `Daily Grind #${getDailyPuzzleNumber(todayKey)}: new puzzles are out!`,
    description: GAMES.map((game) => `${game.emoji} **${game.name}**: ${game.tagline}`).join("\n"),
    color: COLOR,
  };
  if (best.length > 0) embed.fields = [{ name: "Yesterday's best", value: fitField(best) }];
  return { embeds: [embed], components: playButton(), allowed_mentions: noPings };
}
