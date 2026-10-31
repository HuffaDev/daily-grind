import { GAMES } from "@/games/registry";
import { ChannelType, IntegrationType, InteractionContext, OptionType, Permission } from "./discord";

// Slash command definitions, as sent to Discord by scripts/register-commands.ts.
// After changing them, run `bun run register-commands` again.

const inServers = { contexts: [InteractionContext.GUILD], integration_types: [IntegrationType.GUILD_INSTALL] };

export const COMMANDS = [
  {
    name: "play",
    description: "Open Daily Grind and play today's puzzles",
    ...inServers,
  },
  {
    name: "leaderboard",
    description: "Show this server's Daily Grind standings",
    options: [
      {
        name: "game",
        description: "Show today's board for one game instead of all games",
        type: OptionType.STRING,
        required: false,
        choices: GAMES.map((game) => ({ name: game.name, value: game.id })),
      },
    ],
    ...inServers,
  },
  {
    name: "daily",
    description: "Post each day's new puzzles in a channel",
    // Only members who can manage the server see it, unless an admin changes that in the server's settings.
    default_member_permissions: Permission.MANAGE_GUILD.toString(),
    options: [
      {
        name: "set",
        description: "Post the new puzzles in a channel every day at 00:00 UTC",
        type: OptionType.SUB_COMMAND,
        options: [
          {
            name: "channel",
            description: "Where to post",
            type: OptionType.CHANNEL,
            required: true,
            channel_types: [ChannelType.GUILD_TEXT, ChannelType.GUILD_ANNOUNCEMENT],
          },
        ],
      },
      { name: "stop", description: "Stop the daily posts", type: OptionType.SUB_COMMAND },
    ],
    ...inServers,
  },
];
