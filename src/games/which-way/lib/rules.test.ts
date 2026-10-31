import { describe, expect, it } from "bun:test";
import { angleBetween, bearing, compassName, dailyRound, distanceKm, parseAim, playWhichWay, shareLine, targetPoints } from "./rules";

const dateKey = (i: number) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);

describe("directions", () => {
  it("gives the real shortest route", () => {
    // Tokyo is north-east of Paris over Russia, not east, which is the surprise this game runs on.
    const paris = { lat: 48.86, lon: 2.35 };
    expect(compassName(bearing(paris, { lat: 35.69, lon: 139.69 }))).toBe("north-east");
    expect(compassName(bearing(paris, { lat: 40.71, lon: -74 }))).toBe("west");
  });

  it("measures errors the short way round the compass", () => {
    expect(angleBetween(350, 10)).toBe(20);
    expect(angleBetween(0, 180)).toBe(180);
  });
});

describe("dailyRound", () => {
  const rounds = Array.from({ length: 365 }, (_, i) => dailyRound(dateKey(i)));

  it("gives everyone the same round each day", () => {
    expect(dailyRound("2026-11-01")).toEqual(dailyRound("2026-11-01"));
    expect(dailyRound("2026-11-01")).not.toEqual(dailyRound("2026-11-02"));
  });

  it("gives fair targets for a year: other countries, a sensible distance, spread around the compass", () => {
    for (const { origin, targets } of rounds) {
      expect(new Set([origin.country, ...targets.map((t) => t.country)]).size).toBe(6);
      targets.forEach((target, i) => {
        expect(distanceKm(origin, target)).toBeGreaterThanOrEqual(1500);
        expect(distanceKm(origin, target)).toBeLessThanOrEqual(16000);
        for (const other of targets.slice(i + 1)) {
          expect(angleBetween(bearing(origin, target), bearing(origin, other))).toBeGreaterThanOrEqual(25);
        }
      });
    }
  });

  it("doesn't repeat a target within three weeks", () => {
    const last = new Map<string, number>();
    rounds.forEach(({ targets }, day) => {
      for (const { name, country } of targets) {
        const key = `${name}|${country}`;
        if (last.has(key)) expect(day - last.get(key)!).toBeGreaterThan(21);
        last.set(key, day);
      }
    });
  });
});

describe("scoring", () => {
  const day = "2026-11-01";
  const { origin, targets } = dailyRound(day);
  const perfect = targets.map((target) => bearing(origin, target));

  it("rewards closer aim", () => {
    expect(targetPoints(3)).toBe(150);
    expect(targetPoints(47.5)).toBe(75);
    expect(targetPoints(90)).toBe(0);
  });

  it("finishes after five aims, counting it as a solve, for up to 750", () => {
    expect(playWhichWay(day, perfect)).toMatchObject({ finished: true, solved: true, points: 750 });
    expect(playWhichWay(day, perfect.slice(0, 2))).toMatchObject({ finished: false, solved: false, points: 300 });
  });

  it("only accepts a compass direction from a client", () => {
    expect(parseAim(90.5)).toBe(90.5);
    for (const bad of [-1, 361, NaN, "90", null]) expect(parseAim(bad)).toBeUndefined();
  });

  it("shares a line that names no target", () => {
    expect(shareLine(7, "Paris", [10, 30, 100])).toBe("🧭 Which Way #7 from Paris 🟦⬜🟧 10° 30° 100° · 247 pts");
  });
});
