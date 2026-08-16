"use client";

import { Slot } from "@/lib/types";

interface Props {
  title: string;
  slots: Slot[];
  activeSlotId: string | null;
  onSelect: (slot: Slot) => void;
}

export default function ClueList({ title, slots, activeSlotId, onSelect }: Props) {
  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
        {title}
      </h3>
      <ul className="space-y-0.5">
        {slots.map((slot) => (
          <li key={slot.id}>
            <button
              type="button"
              onClick={() => onSelect(slot)}
              className={`w-full text-left text-sm px-2 py-1 rounded transition-colors ${
                activeSlotId === slot.id
                  ? "bg-amber-200 dark:bg-amber-800 text-neutral-900 dark:text-neutral-50"
                  : "hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
              }`}
            >
              <span className="font-semibold mr-1">{slot.number}.</span>
              {slot.clue}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
