import { after } from "next/server";
import { Interaction, ResponseType, verifyInteraction } from "@/bot/discord";
import { handleInteraction } from "@/bot/interactions";
import { tidyLaunchCards } from "@/bot/launchCards";

/**
 * The bot's Interactions Endpoint URL (Developer Portal → General Information):
 * Discord POSTs every slash command and button press here.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyInteraction(req, rawBody))) return new Response("Invalid request signature", { status: 401 });
  const interaction = JSON.parse(rawBody) as Interaction;
  const response = await handleInteraction(interaction);
  // Launching posts a new card in the channel; once the reply is sent, clear the earlier ones.
  if (response.type === ResponseType.LAUNCH_ACTIVITY && interaction.guild_id && interaction.channel_id) {
    const { channel_id, application_id, id } = interaction;
    after(() => tidyLaunchCards(channel_id, application_id, id));
  }
  return Response.json(response);
}
