"use client";

import Link from "next/link";
import { ComponentProps, useSyncExternalStore } from "react";

const noSubscription = () => () => {};

/**
 * A link between pages of the app that keeps the current query string. Discord
 * launches the Activity with params (frame_id, instance_id, guild_id, …) that
 * the SDK reads from the URL, so they must survive moving between games.
 */
export default function LaunchLink({ href, ...props }: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  // Empty while server rendering and hydrating, then the real query string.
  const search = useSyncExternalStore(
    noSubscription,
    () => window.location.search,
    () => ""
  );
  return <Link href={href + search} {...props} />;
}
