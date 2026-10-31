import { Interaction, verifyInteraction } from "@/bot/discord";
import { handleInteraction } from "@/bot/interactions";

/**
 * The bot's Interactions Endpoint URL (Developer Portal → General Information):
 * Discord POSTs every slash command and button press here.
 */
export async function POST(req: Request) {
  const rawBody = await req.text();
  if (!(await verifyInteraction(req, rawBody))) return new Response("Invalid request signature", { status: 401 });
  return Response.json(await handleInteraction(JSON.parse(rawBody) as Interaction));
}
