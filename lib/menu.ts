// Customer menu: active items only, cached across requests and refreshed by cacheTag("menu")
// when the admin edits the menu.

import { cacheLife, cacheTag } from "next/cache";
import { toCents } from "./format.ts";
import { publicClient } from "./supabase/clients.ts";

export type MenuCategory = "set" | "christmas" | "extra" | "side";

export type MenuItem = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: MenuCategory;
  priceCents: number; // before GST
  imagePath: string | null;
  serves: string | null;
  ribUnits: number;
  availableFrom: string | null; // "YYYY-MM-DD", seasonal items only
  availableTo: string | null;
};

/** Display order and labels for menu sections (docs/DESIGN.md §7.3). */
export const MENU_SECTIONS: { category: MenuCategory; id: string; label: string }[] = [
  { category: "set", id: "sets", label: "Barbecue sets" },
  { category: "christmas", id: "christmas", label: "Christmas" },
  { category: "extra", id: "extra-ribs", label: "Extra ribs" },
  { category: "side", id: "sides", label: "Sides" },
];

type MenuRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: MenuCategory;
  price: string | number;
  image_path: string | null;
  serves: string | null;
  rib_units: number;
  available_from: string | null;
  available_to: string | null;
};

export async function getMenu(): Promise<MenuItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("menu");

  const { data, error } = await publicClient()
    .from("menu_items")
    // price::text keeps the exact decimal (no float) on the way out of Postgres.
    .select("id, slug, name, description, category, price::text, image_path, serves, rib_units, available_from, available_to")
    .eq("is_active", true)
    .order("sort_order")
    .limit(200);
  if (error) throw new Error(`Failed to load menu: ${error.message}`);

  return (data as MenuRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    category: row.category,
    priceCents: toCents(String(row.price)),
    imagePath: row.image_path,
    serves: row.serves,
    ribUnits: row.rib_units,
    availableFrom: row.available_from,
    availableTo: row.available_to,
  }));
}
