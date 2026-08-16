"use client";

import { useState } from "react";

interface Props {
  text: string;
  className?: string;
}

export default function ShareButton({ text, className }: Props) {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
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
