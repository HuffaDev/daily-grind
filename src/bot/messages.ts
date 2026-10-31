import { GAMES, type GameInfo } from "@/games/registry";
import { getDailyPuzzleNumber, getPuzzleId, previousDateKey } from "@/platform/daily";
import { getDailyBoard, getGlobalBoard } from "@/platform/server/leaderboard";
import { compareEntries } from "@/platform/server/standings";
import { getStore } from "@/platform/server/store";
import { Embed, escapeMarkdown, MessageBody } from "./discord";

/** Button id that launches the Activity (see handleInteraction). */
export const PLAY_BUTTON_ID = "play";

const COLOR = 0xf59e0b;
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
  if (best.length > 0) embed.fields = [{ name: "Yesterday's best", value: best.join("\n") }];
  return { embeds: [embed], components: playButton(), allowed_mentions: noPings };
}
