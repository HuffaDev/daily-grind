// Registers the bot's slash commands with Discord (src/bot/commands.ts). Run it
// once after setup and again whenever the commands change: `bun run register-commands`.
// Needs NEXT_PUBLIC_DISCORD_CLIENT_ID and DISCORD_BOT_TOKEN, read from local.env.
import { COMMANDS } from "../src/bot/commands";
import { botRequest, CommandType, EntryPointHandler } from "../src/bot/discord";

const appId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
if (!appId) throw new Error("NEXT_PUBLIC_DISCORD_CLIENT_ID is not set");

// Replacing the command list must keep the Entry Point command Discord made for
// the Activity, or Discord rejects the whole update. Its handler is switched to
// the app, so launches reach the bot, which launches the Activity itself and
// then tidies up earlier launch cards (src/bot/launchCards.ts).
const existing = await botRequest<{ type: number }[]>(`/applications/${appId}/commands`);
const entryPoints = existing
  .filter((command) => command.type === CommandType.ENTRY_POINT)
  .map((command) => ({ ...command, handler: EntryPointHandler.APP_HANDLER }));

const registered = await botRequest<{ name: string }[]>(`/applications/${appId}/commands`, {
  method: "PUT",
  body: JSON.stringify([...entryPoints, ...COMMANDS]),
});
console.log(`Registered: ${registered.map((command) => `/${command.name}`).join(", ")}`);
