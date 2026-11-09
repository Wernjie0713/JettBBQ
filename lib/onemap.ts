// OneMap (Singapore Land Authority) postal code search. Public endpoint, no token needed.
// Shared by the geocode script and the checkout address lookup.

import { z } from "zod";

const ONEMAP_URL = "https://www.onemap.gov.sg/api/common/elastic/search";

export type GeocodeResult = { lat: number; lng: number; address: string };

// External response: only the fields we use, checked before use. Unknown fields are ignored.
const responseSchema = z.object({
  results: z
    .array(
      z.object({
        POSTAL: z.string().optional(),
        LATITUDE: z.string().optional(),
        LONGITUDE: z.string().optional(),
        ADDRESS: z.string().optional(),
      }),
    )
    .optional(),
});

/**
 * Look up one 6-digit postal code. Returns null when OneMap has no exact match or the point is
 * outside Singapore; throws on network/HTTP errors (callers decide whether to retry).
 */
export async function lookupPostalCode(
  postalCode: string,
  timeoutMs = 10_000,
): Promise<GeocodeResult | null> {
  if (!/^\d{6}$/.test(postalCode)) throw new Error(`Invalid postal code: ${postalCode}`);
  const url = `${ONEMAP_URL}?searchVal=${postalCode}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`OneMap HTTP ${res.status}`);
  const parsed = responseSchema.safeParse(await res.json());
  if (!parsed.success) throw new Error(`OneMap returned an unexpected response: ${parsed.error.message}`);
  const match = (parsed.data.results ?? []).find((r) => r.POSTAL === postalCode);
  if (!match) return null;
  const lat = Number(match.LATITUDE);
  const lng = Number(match.LONGITUDE);
  // Validate the external response: must be a real point inside Singapore.
  if (!(lat > 1.15 && lat < 1.48 && lng > 103.6 && lng < 104.1)) return null;
  return { lat, lng, address: match.ADDRESS ?? "" };
}
