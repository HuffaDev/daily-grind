import { mulberry32, seedForDateKey } from "@/platform/daily";

// Works through a whole pool before anything comes round again, instead of picking at random each day.
// The order is built by playing the schedule forward from a fixed start date, so it's the same for
// everyone, and remembered so each later day only adds the days it needs.

const SCHEDULE_START_UTC = Date.UTC(2026, 0, 1);
// How much of the last pass stays at the back of the next one.
const HELD_BACK_SHARE = 0.75;
const DAY_MS = 86_400_000;

/** Which day of the schedule a date is. */
export function scheduleDay(dateKey: string): number {
  const [y, m, d] = dateKey.split("-").map(Number);
  return Math.max(0, Math.round((Date.UTC(y, m - 1, d) - SCHEDULE_START_UTC) / DAY_MS));
}

/** Hands out a pool's items in a shuffled order, reshuffling only when every item has been used. */
export class Cycle<T> {
  private readonly random: () => number;
  private queue: T[] = [];
  private readonly lastTaken = new Map<T, number>();
  private taken = 0;

  constructor(private readonly pool: readonly T[], name: string) {
    this.random = mulberry32(seedForDateKey(`schedule:${name}`));
  }

  private refill() {
    const shuffled = [...this.pool];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // The most recently used wait at the back, oldest first, so nothing returns soon after a reshuffle.
    const heldBackFrom = this.taken - this.pool.length * HELD_BACK_SHARE;
    const isHeld = (item: T) => (this.lastTaken.get(item) ?? -Infinity) >= heldBackFrom;
    const held = shuffled.filter(isHeld).sort((a, b) => this.lastTaken.get(a)! - this.lastTaken.get(b)!);
    this.queue = [...shuffled.filter((item) => !isHeld(item)), ...held];
  }

  /** The next item `accept` allows. It looks further down the queue rather than break a day's rules. */
  take(accept: (item: T) => boolean = () => true): T {
    if (this.queue.length === 0) this.refill();
    let item = this.queue.find(accept);
    if (item === undefined) {
      // Nothing left in this pass fits today, so it borrows whichever fitting item was used longest ago.
      const age = (candidate: T) => this.lastTaken.get(candidate) ?? -Infinity;
      item = this.pool.filter(accept).sort((a, b) => age(a) - age(b))[0] ?? this.queue[0];
    }
    const index = this.queue.indexOf(item);
    if (index >= 0) this.queue.splice(index, 1);
    this.lastTaken.set(item, this.taken++);
    return item;
  }
}

/** Builds each day once, in order, since a day's picks depend on every day before it. */
export function makeSchedule<D>(buildNextDay: () => D): (day: number) => D {
  const days: D[] = [];
  return (day) => {
    while (days.length <= day) days.push(buildNextDay());
    return days[day];
  };
}

/** At most `cap` items per group, so one country can't fill a pool. Which ones is seeded, not by order. */
export function capPerGroup<T>(items: readonly T[], group: (item: T) => string, cap: number, name: string): T[] {
  const random = mulberry32(seedForDateKey(`cap:${name}`));
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const counts = new Map<string, number>();
  return shuffled.filter((item) => {
    const count = counts.get(group(item)) ?? 0;
    if (count >= cap) return false;
    counts.set(group(item), count + 1);
    return true;
  });
}
