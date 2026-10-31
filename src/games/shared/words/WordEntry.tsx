"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

/**
 * A box to type a word into. `onSubmit` returns why the word isn't allowed,
 * which shows under the box, or null to accept it and clear the box.
 */
export default function WordEntry({
  length,
  placeholder,
  onSubmit,
}: {
  /** Longest word allowed. */
  length: number;
  placeholder: string;
  onSubmit: (word: string) => string | null;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  function submit(e: FormEvent) {
    e.preventDefault();
    const word = value.trim().toLowerCase();
    if (!word) return;
    const reason = onSubmit(word);
    setError(reason);
    if (!reason) setValue("");
    inputRef.current?.focus();
  }

  return (
    <form onSubmit={submit} className="flex flex-col items-center gap-1">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value.replace(/[^a-z]/gi, "").slice(0, length));
            setError(null);
          }}
          maxLength={length}
          placeholder={placeholder}
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={placeholder}
          className="w-44 rounded-lg px-3 py-2 text-center font-mono text-lg font-bold uppercase tracking-[0.3em] bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 ring-1 ring-neutral-300 dark:ring-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-lg font-semibold bg-amber-500 hover:bg-amber-400 text-neutral-900 transition-colors"
        >
          Enter
        </button>
      </div>
      <p role="status" className="h-5 text-sm text-red-600 dark:text-red-400">
        {error}
      </p>
    </form>
  );
}

/** A word as a row of letter tiles; `highlight` marks positions in amber, `tone` colours the whole word. */
export function WordTiles({
  word,
  highlight = [],
  tone = "plain",
}: {
  word: string;
  highlight?: number[];
  tone?: "plain" | "start" | "target" | "ghost";
}) {
  const tones = {
    plain: "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-50 ring-neutral-300 dark:ring-neutral-700",
    start: "bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 ring-neutral-800 dark:ring-neutral-200",
    target: "bg-green-600 text-white ring-green-600",
    ghost: "bg-transparent text-neutral-400 dark:text-neutral-500 ring-neutral-300 dark:ring-neutral-700 ring-dashed",
  };
  return (
    <div className="flex justify-center gap-1.5">
      {[...word].map((letter, i) => (
        <span
          key={i}
          className={`flex size-10 items-center justify-center rounded-md ring-1 font-mono text-xl font-bold uppercase ${
            highlight.includes(i) ? "bg-amber-400 text-neutral-900 ring-amber-400" : tones[tone]
          }`}
        >
          {letter}
        </span>
      ))}
    </div>
  );
}
