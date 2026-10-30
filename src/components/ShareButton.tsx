"use client";

import { useState } from "react";

interface Props {
  text: string;
  /** Replaces copying to the clipboard, e.g. with Discord's share dialog (the clipboard is blocked in Activities). */
  onShare?: (text: string) => Promise<void>;
  className?: string;
}

export default function ShareButton({ text, onShare, className }: Props) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      if (onShare) {
        await onShare(text);
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be unavailable (e.g. non-secure context); nothing
      // useful to do beyond leaving the button in its normal state.
    }
  };

  return (
    <button type="button" onClick={handleClick} className={className}>
      {copied ? "Copied to clipboard!" : "Share Result"}
    </button>
  );
}
