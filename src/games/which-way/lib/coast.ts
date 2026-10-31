import LAND from "./land.json";

const COASTAL_WITHIN_KM = 90;
const KM_PER_DEGREE = 111.2;

/** Whether a place is near the sea, so its background can show water. Land shapes are coarse, so this is rough. */
export function isCoastal(place: { lat: number; lon: number }): boolean {
  const xScale = Math.cos((place.lat * Math.PI) / 180);
  for (const ring of LAND as [number, number][][]) {
    for (const [lon, lat] of ring) {
      if (Math.hypot((lon - place.lon) * xScale, lat - place.lat) * KM_PER_DEGREE < COASTAL_WITHIN_KM) return true;
    }
  }
  return false;
}
