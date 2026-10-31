// The look every round game shares, so they read as one set: dark ink, cream actions, one blue and one
// amber accent, hand lettering for the big words and Geist for everything else.

export const screen = "fixed inset-0 select-none overflow-hidden bg-[#12141c] font-sans text-[#ece7dc]";

export const pressable =
  "cursor-pointer transition duration-150 hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f4ecd8] disabled:cursor-default";

const button = `${pressable} inline-flex min-h-12 items-center justify-center rounded-xl px-6 text-base font-semibold`;

export const primaryButton = `${button} bg-[#f4ecd8] text-[#1c1a16] shadow-lg shadow-black/30`;
export const secondaryButton = `${button} bg-white/10 text-[#ece7dc] ring-1 ring-white/15 hover:bg-white/15`;

export const panel = "rounded-2xl bg-[#171a24]/95 text-[#ece7dc] shadow-2xl shadow-black/40 ring-1 ring-white/10";

export const muted = "text-[#ece7dc]/70";
export const hint = "text-sm text-[#ece7dc]/75";

export const linkHover = "cursor-pointer transition hover:text-white";

/** Hex values for canvases, which can't use the classes above. */
export const TRUE_COLOR = "#7db0ff";
export const AIM_COLOR = "#fbbf24";
