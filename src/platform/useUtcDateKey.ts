"use client";

import { useEffect, useState } from "react";
import { getUtcDateKey, millisUntilNextUtcMidnight } from "./daily";

/** Today's UTC date key, updated when the day rolls over while the page stays open. */
export function useUtcDateKey(): string {
  const [dateKey, setDateKey] = useState(() => getUtcDateKey());

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;
    const update = () => setDateKey(getUtcDateKey());
    const schedule = () => {
      id = setTimeout(() => {
        update();
        schedule();
      }, millisUntilNextUtcMidnight() + 500);
    };
    schedule();
    // Timers are throttled in background tabs and paused while a device
    // sleeps, so also re-check whenever the page becomes visible again.
    document.addEventListener("visibilitychange", update);
    return () => {
      clearTimeout(id);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  return dateKey;
}
