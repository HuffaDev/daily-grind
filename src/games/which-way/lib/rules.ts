import { capPerGroup, Cycle, makeSchedule, scheduleDay } from "@/platform/roundGame/schedule";
import type { RoundResult } from "@/platform/roundGame/types";
import CITY_ROWS from "./cities.json";
import type { WhichWayDetail } from "../meta";

// Natural Earth places (public domain): capitals and huge cities.

export interface City {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export interface Round {
  origin: City;
  targets: City[];
}

export const TARGETS_PER_DAY = 5;
export const MAX_POINTS_PER_TARGET = 150;
export const MAX_SCORE = TARGETS_PER_DAY * MAX_POINTS_PER_TARGET;
const FULL_POINTS_WITHIN = 5;
const ZERO_POINTS_AT = 90;
const MIN_TARGET_KM = 1500;
// Near the far side of the world every direction is almost equally right, which isn't a fair question.
const MAX_TARGET_KM = 16000;
// Keeps the day's answers spread around the compass instead of all pointing one way.
const MIN_BEARING_SPREAD = 25;
const MAX_CITIES_PER_COUNTRY = 8;
const EARTH_RADIUS_KM = 6371;

const CITIES: readonly City[] = (CITY_ROWS as [string, string, number, number][]).map(([name, country, lat, lon]) => ({ name, country, lat, lon }));

const radians = (degrees: number) => (degrees * Math.PI) / 180;

export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dLat = radians(b.lat - a.lat);
  const dLon = radians(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The compass direction to set off in, 0 to 360 with 0 as north, along the shortest route. */
export function bearing(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  const dLon = radians(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(radians(to.lat));
  const x = Math.cos(radians(from.lat)) * Math.sin(radians(to.lat)) - Math.sin(radians(from.lat)) * Math.cos(radians(to.lat)) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** How far apart two compass directions are, 0 to 180. */
export function angleBetween(a: number, b: number): number {
  const difference = Math.abs(((a - b) % 360) + 360) % 360;
  return difference > 180 ? 360 - difference : difference;
}

export function compassName(degrees: number): string {
  const names = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return names[Math.round(((degrees % 360) + 360) / 45) % 8];
}

export function targetPoints(errorDegrees: number): number {
  if (errorDegrees <= FULL_POINTS_WITHIN) return MAX_POINTS_PER_TARGET;
  const left = (ZERO_POINTS_AT - errorDegrees) / (ZERO_POINTS_AT - FULL_POINTS_WITHIN);
  return Math.round(MAX_POINTS_PER_TARGET * Math.max(0, left));
}

export const totalScore = (errors: readonly number[]) => errors.reduce((sum, error) => sum + targetPoints(error), 0);

function square(error: number): string {
  if (error <= 15) return "🟦";
  return error <= 45 ? "⬜" : "🟧";
}

/** Names the starting city, which is the same for everyone, and none of the targets. */
export function shareLine(puzzleNumber: number, originName: string, errors: readonly number[], url?: string): string {
  const degrees = errors.map((error) => `${Math.round(error)}°`).join(" ");
  const line = `🧭 Which Way #${puzzleNumber} from ${originName} ${errors.map(square).join("")} ${degrees} · ${totalScore(errors)} pts`;
  return url ? `${line}\n\n${url}` : line;
}

const famous = capPerGroup(CITIES, (city) => city.country, MAX_CITIES_PER_COUNTRY, "whichway");
const origins = new Cycle(famous, "whichway:origins");
const targetCycle = new Cycle(famous, "whichway:targets");

const roundSchedule = makeSchedule((): Round => {
  const origin = origins.take();
  const targets: City[] = [];
  const countries = new Set([origin.country]);
  for (let i = 0; i < TARGETS_PER_DAY; i++) {
    const target = targetCycle.take((city) => {
      if (countries.has(city.country)) return false;
      const km = distanceKm(origin, city);
      if (km < MIN_TARGET_KM || km > MAX_TARGET_KM) return false;
      const direction = bearing(origin, city);
      return !targets.some((other) => angleBetween(bearing(origin, other), direction) < MIN_BEARING_SPREAD);
    });
    targets.push(target);
    countries.add(target.country);
  }
  return { origin, targets };
});

/** The day's starting city and five well-known places to point at, none repeating until its pool runs out. */
export function dailyRound(dateKey: string): Round {
  return roundSchedule(scheduleDay(dateKey));
}

/** How far off each aim was, in the order they were made. */
export function aimErrors(dateKey: string, aims: readonly number[]): number[] {
  const { origin, targets } = dailyRound(dateKey);
  return aims.slice(0, TARGETS_PER_DAY).map((aim, i) => angleBetween(aim, bearing(origin, targets[i])));
}

/** Scores the aims made so far. Moves are aims in compass degrees. */
export function playWhichWay(dateKey: string, aims: readonly number[]): RoundResult<WhichWayDetail> {
  const errors = aimErrors(dateKey, aims);
  const finished = errors.length === TARGETS_PER_DAY;
  return {
    finished,
    solved: finished,
    points: totalScore(errors),
    detail: {
      aimed: errors.length,
      total: TARGETS_PER_DAY,
      averageError: errors.length ? Math.round(errors.reduce((sum, error) => sum + error, 0) / errors.length) : 0,
    },
  };
}

export function parseAim(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 360 ? value : undefined;
}
