// Geocode every unique postal code in the order export via OneMap (Singapore government API).
// Results are cached in data/postal-codes.json, so re-runs only fetch what is missing.
//
// Usage: node scripts/geocode-postal-codes.ts [csvPath]

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { lookupPostalCode, type GeocodeResult as CacheEntry } from "../lib/onemap.ts";
import { readOrdersCsv } from "./lib/orders-csv.ts";

type Cache = Record<string, CacheEntry>;

const CSV_PATH = process.argv[2] ?? "data/orders-dec2025-anonymised.csv";
const CACHE_PATH = "data/postal-codes.json";
const MAX_ATTEMPTS = 3;
const MIN_INTERVAL_MS = 300; // ~200 requests/min, under OneMap's published 250/min limit
const SAVE_EVERY = 50;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadCache(): Cache {
  return existsSync(CACHE_PATH) ? (JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Cache) : {};
}

function saveCache(cache: Cache) {
  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(CACHE_PATH, JSON.stringify(sorted, null, 1) + "\n");
}

async function lookupWithRetry(postalCode: string): Promise<CacheEntry | null> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await lookupPostalCode(postalCode);
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) throw error;
      await sleep(1000 * 2 ** attempt);
    }
  }
  return null;
}

async function main() {
  const { orders } = readOrdersCsv(CSV_PATH);
  const unique = [...new Set(orders.map((o) => o.postalCode))];
  const cache = loadCache();
  const todo = unique.filter((pc) => !cache[pc]);
  console.log(`${unique.length} unique postal codes, ${todo.length} to fetch`);

  const notFound: string[] = [];
  const failed: string[] = [];
  let done = 0;

  for (const postalCode of todo) {
    const started = Date.now();
    try {
      const entry = await lookupWithRetry(postalCode);
      if (entry) cache[postalCode] = entry;
      else notFound.push(postalCode);
    } catch (error) {
      failed.push(postalCode);
      console.error(`Lookup failed for ${postalCode}:`, error);
    }
    done++;
    if (done % SAVE_EVERY === 0) {
      saveCache(cache);
      console.log(`${done}/${todo.length}`);
    }
    await sleep(Math.max(0, MIN_INTERVAL_MS - (Date.now() - started)));
  }

  saveCache(cache);
  console.log(`Done. Cached ${Object.keys(cache).length}/${unique.length}.`);
  if (notFound.length) console.log(`Not found (${notFound.length}): ${notFound.join(", ")}`);
  if (failed.length) console.log(`Failed after retries (${failed.length}): ${failed.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
