"use client";

import { Slot } from "../lib/types";

interface Props {
  title: string;
  slots: Slot[];
  activeSlotId: string | null;
  onSelect: (slot: Slot) => void;
  /** Slots solved correctly, shown ticked and dimmed. */
  solvedIds: Set<string>;
}

export default function ClueList({ title, slots, activeSlotId, onSelect, solvedIds }: Props) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
        {title}
      </h3>
      <ul className="space-y-0.5">
        {slots.map((slot) => {
          const solved = solvedIds.has(slot.id);
          return (
            <li key={slot.id}>
              <button
                type="button"
                onClick={() => onSelect(slot)}
                className={`w-full text-left text-sm px-2 py-1 rounded transition-colors ${
                  activeSlotId === slot.id
                    ? "bg-amber-200 dark:bg-amber-800 text-neutral-900 dark:text-neutral-50"
                    : solved
                      ? "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-400 dark:text-neutral-500"
                      : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
                }`}
              >
                <span className="font-semibold mr-1">{slot.number}.</span>
                <span className={solved ? "line-through" : undefined}>{slot.clue}</span>
                {solved && <span className="ml-1 text-green-600 dark:text-green-500" aria-label="solved">✓</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
