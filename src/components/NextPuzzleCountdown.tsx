"use client";

import { useEffect, useState } from "react";
import { millisUntilNextUtcMidnight } from "@/lib/daily";

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => n.toString().padStart(2, "0")).join(":");
}

export default function NextPuzzleCountdown() {
  // Wall-clock-dependent, so it must start out matching the server-rendered
  // placeholder and only pick up the real value after mount.
  const [remainingMs, setRemainingMs] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      setRemainingMs(millisUntilNextUtcMidnight());
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return <span className="font-mono tabular-nums">{remainingMs === null ? "--:--:--" : formatCountdown(remainingMs)}</span>;
}
