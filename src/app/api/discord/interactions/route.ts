import { after } from "next/server";
import { Interaction, ResponseType, verifyInteraction } from "@/bot/discord";
import { handleInteraction } from "@/bot/interactions";
import { announceLaunch } from "@/bot/playingCard";

/**
 * The bot's Interactions Endpoint URL (Developer Portal → General Information):
 * Discord POSTs every slash command and button press here.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyInteraction(req, rawBody))) return new Response("Invalid request signature", { status: 401 });
  const interaction = JSON.parse(rawBody) as Interaction;
  const response = await handleInteraction(interaction);
  // Once the reply is sent, show the launch on the channel's "Playing" card.
  if (response.type === ResponseType.LAUNCH_ACTIVITY) after(() => announceLaunch(interaction));
  return Response.json(response);
}
