import { getGame } from "@/games/registry";
import { getUtcDateKey } from "@/platform/daily";
import { getStore } from "@/platform/server/store";
import { postDaily } from "./daily";
import { CommandOption, DiscordApiError, Interaction, InteractionResponse, InteractionType, MessageFlags, ResponseType } from "./discord";
import { gameBoardMessage, globalBoardMessage, PLAY_BUTTON_ID } from "./messages";

const launchActivity: InteractionResponse = { type: ResponseType.LAUNCH_ACTIVITY };

/** A reply only the person who ran the command sees. */
function privateReply(content: string): InteractionResponse {
  return { type: ResponseType.CHANNEL_MESSAGE, data: { content, flags: MessageFlags.EPHEMERAL } };
}

function option(options: CommandOption[] | undefined, name: string): CommandOption | undefined {
  return options?.find((o) => o.name === name);
}

/**
 * Answers one interaction Discord sent to /api/discord/interactions. Discord
 * waits at most 3 seconds for the reply, so everything here must be quick.
 */
export async function handleInteraction(interaction: Interaction): Promise<InteractionResponse> {
  if (interaction.type === InteractionType.PING) return { type: ResponseType.PONG };

  if (interaction.type === InteractionType.MESSAGE_COMPONENT && interaction.data?.custom_id === PLAY_BUTTON_ID) {
    return launchActivity;
  }

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) return privateReply("Sorry, I don't know that one.");

  const guildId = interaction.guild_id;
  // Commands are registered for servers only, but Discord can still deliver stale ones elsewhere.
  if (!guildId) return privateReply("Daily Grind commands work in servers.");

  switch (interaction.data?.name) {
    case "play":
      return launchActivity;
    case "leaderboard":
      return leaderboard(guildId, interaction.data.options);
    case "daily":
      return daily(guildId, interaction.data.options);
    default:
      return privateReply("Sorry, I don't know that command.");
  }
}

async function leaderboard(guildId: string, options: CommandOption[] | undefined): Promise<InteractionResponse> {
  const gameId = option(options, "game")?.value;
  const scope = `guild:${guildId}`;
  if (gameId === undefined) return { type: ResponseType.CHANNEL_MESSAGE, data: await globalBoardMessage(scope) };
  const game = getGame(gameId);
  if (!game) return privateReply("That game doesn't exist (anymore).");
  return { type: ResponseType.CHANNEL_MESSAGE, data: await gameBoardMessage(scope, game, getUtcDateKey()) };
}

async function daily(guildId: string, options: CommandOption[] | undefined): Promise<InteractionResponse> {
  const store = getStore();
  const set = option(options, "set");
  if (set) {
    const channelId = String(option(set.options, "channel")?.value ?? "");
    if (!channelId) return privateReply("Pick a channel to post in.");
    try {
      // Posting today's announcement right away doubles as a check that the bot can post there.
      await postDaily(guildId, channelId, getUtcDateKey(), { always: true });
    } catch (err) {
      if (!(err instanceof DiscordApiError)) throw err;
      return privateReply(
        `I can't post in <#${channelId}>. Make sure I can view the channel, send messages and embed links there, then try again.`
      );
    }
    await store.setDailyChannel(guildId, channelId);
    return privateReply(`Daily posts will go to <#${channelId}> every day when the new puzzles come out (00:00 UTC).`);
  }

  if (option(options, "stop")) {
    await store.setDailyChannel(guildId, null);
    return privateReply("Daily posts are off. Turn them back on with `/daily set`.");
  }
  return privateReply("Use `/daily set` or `/daily stop`.");
}
