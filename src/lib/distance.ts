/**
 * Rough "how far is this" helpers for job cards.
 *
 * These are straight-line estimates. Real travel follows roads, so the distance
 * is padded by a detour factor before being turned into a time. That is good
 * enough to answer "is this near me?", and deliberately not presented as a
 * routing result - proper times would need a directions API (Google, Mapbox,
 * OSRM) and a request per job.
 *
 * Job coordinates are also blurred by a few hundred metres for anyone who has
 * not been hired (see jobForViewer), so precision beyond "about N minutes"
 * would be false anyway.
 */

export type LatLng = [number, number];

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Streets are not straight; this is the usual rule-of-thumb padding. */
const DETOUR_FACTOR = 1.3;
const WALK_KMH = 5;
const DRIVE_KMH = 30;

/** Below this, walking is the sensible way to picture the trip. */
const WALKABLE_KM = 1.5;

/**
 * A short human label such as "8 min walk" or "12 min drive".
 * Returns null when the distance is too large for either to be meaningful.
 */
export function travelLabel(straightLineKm: number): string | null {
  const roadKm = straightLineKm * DETOUR_FACTOR;

  if (roadKm > 60) return null;

  const walking = roadKm <= WALKABLE_KM;
  const minutes = Math.round((roadKm / (walking ? WALK_KMH : DRIVE_KMH)) * 60);

  // Under a minute still reads better as "1 min" than "0 min".
  return `${Math.max(1, minutes)} min ${walking ? 'walk' : 'drive'}`;
}

/** Convenience: label for a job relative to the viewer, or null if unknown. */
export function travelLabelBetween(from: LatLng | null, to: LatLng | null): string | null {
  if (!from || !to) return null;
  if (!Number.isFinite(to[0]) || !Number.isFinite(to[1])) return null;
  return travelLabel(distanceKm(from, to));
}
