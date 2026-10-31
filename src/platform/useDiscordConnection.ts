"use client";

import { useEffect, useState } from "react";
import { connectDiscord, DiscordConnection, isInDiscord } from "./discordClient";

/**
 * Inside Discord, signs in so play counts toward the server's leaderboards;
 * in a plain browser it stays null and games run fully locally. The sign-in
 * happens once per page load and is shared by the hub and every game.
 */
export function useDiscordConnection(): { connection: DiscordConnection | null; error: string | null } {
  const [state, setState] = useState<{ connection: DiscordConnection | null; error: string | null }>({
    connection: null,
    error: null,
  });

  useEffect(() => {
    if (!isInDiscord()) return;
    let cancelled = false;
    connectDiscord().then(
      (connection) => !cancelled && setState({ connection, error: null }),
      (err: Error) => !cancelled && setState({ connection: null, error: err.message })
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
