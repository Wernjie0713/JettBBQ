export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in km. Matches public.distance_km in the database. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass-free angle of `point` around `origin`, in radians (-π..π). Used by sweep clustering. */
export function angleAround(origin: LatLng, point: LatLng): number {
  // Scale longitude by cos(latitude) so angles aren't stretched (small at 1.3°N, but correct).
  return Math.atan2(point.lat - origin.lat, (point.lng - origin.lng) * Math.cos(toRad(origin.lat)));
}
