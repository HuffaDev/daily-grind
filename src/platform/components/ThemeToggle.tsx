"use client";

import { useEffect, useSyncExternalStore } from "react";
import { connectDiscord, fetchTheme, isInDiscord, saveTheme } from "../discordClient";
import type { Theme } from "../server/store";

// Every page has its own toggle, but the saved theme is only loaded once per
// page load, and never replaces a choice made while it was on its way.
let restoreStarted = false;
let choseThisLoad = false;

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  try {
    window.localStorage.setItem("theme", theme);
  } catch {
    // Storage can be unavailable in an embedded frame; the theme still applies for this visit.
  }
}

// The class on <html> is the source of truth: the beforeInteractive script sets
// it first, and the saved theme can change it after this button has mounted.
function subscribeToTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

export default function ThemeToggle() {
  const isDark = useSyncExternalStore(
    subscribeToTheme,
    () => document.documentElement.classList.contains("dark"),
    () => false
  );

  useEffect(() => {
    if (restoreStarted || !isInDiscord()) return;
    restoreStarted = true;
    // Players lose the localStorage copy between Activity launches, so the server has the lasting one.
    connectDiscord()
      .then(fetchTheme)
      .then((theme) => {
        if (theme && !choseThisLoad) applyTheme(theme);
      })
      .catch((err) => console.warn("Could not load the saved theme", err));
  }, []);

  const toggle = () => {
    const next = isDark ? "light" : "dark";
    choseThisLoad = true;
    applyTheme(next);
    if (isInDiscord()) {
      connectDiscord()
        .then((connection) => saveTheme(connection, next))
        .catch((err) => console.warn("Could not save the theme", err));
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="px-3 py-1.5 rounded-md text-sm font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-800 dark:text-neutral-200 hover:bg-neutral-300 dark:hover:bg-neutral-700 transition-colors"
    >
      {isDark ? "☀️" : "🌙"}
    </button>
  );
}
