// Static seed data: menu and slot templates. Prices are before GST (docs/ARCHITECTURE.md §9).

export type MenuSeed = {
  slug: string;
  name: string;
  description: string;
  category: "set" | "christmas" | "extra" | "side";
  price: string; // decimal string
  image_path: string | null;
  serves: string | null;
  rib_units: number;
  load_units: number; // vehicle space; 1 = one Beef Rib Set box
  available_from: string | null;
  available_to: string | null;
  is_active: boolean;
  sort_order: number;
};

const SEASON_2026 = { from: "2026-11-27", to: "2027-01-03" };
const SEASON_2025 = { from: "2025-11-27", to: "2026-01-03" };

export const MENU: MenuSeed[] = [
  // Year-round — names and prices from order.jettbarbecue.sg (Nov 2026).
  {
    slug: "usda-prime-beef-rib-set",
    name: "USDA Prime Beef Rib Set",
    description:
      "2 USDA Prime beef ribs (1.1–1.2 kg cooked), smoked 8–14 hours over oak in our 800-gallon smoker, with mashed potato, lime-infused coleslaw, sauces and pickles.",
    category: "set",
    price: "195.00",
    image_path: "/images/beef-rib-set-spread.webp",
    serves: "Feeds 3–5",
    rib_units: 2,
    load_units: 1,
    available_from: null,
    available_to: null,
    is_active: true,
    sort_order: 10,
  },
  {
    slug: "extra-beef-rib-with-side",
    name: "Extra Beef Rib (with side of your choice)",
    description: "One USDA Prime beef rib, smoked 8–14 hours over oak, with one of our sides.",
    category: "extra",
    price: "99.00",
    image_path: "/images/beef-rib-board.webp",
    serves: "Feeds 1.5–2.5",
    rib_units: 1,
    load_units: 0.6,
    available_from: null,
    available_to: null,
    is_active: true,
    sort_order: 20,
  },
  {
    slug: "extra-beef-rib",
    name: "Extra Beef Rib (without sides)",
    description: "One USDA Prime beef rib, smoked 8–14 hours over oak.",
    category: "extra",
    price: "87.50",
    image_path: "/images/beef-rib-sliced.webp",
    serves: "Feeds 1.5–2.5",
    rib_units: 1,
    load_units: 0.5,
    available_from: null,
    available_to: null,
    is_active: true,
    sort_order: 21,
  },
  side("signature-mashed-potato", "Signature Mashed Potato", "Our signature creamy mashed potato.", "14.00", "side-mashed-potato", 30),
  side("lime-infused-coleslaw", "Lime-Infused Coleslaw", "Slightly tangy and refreshing; pairs perfectly with a rich meal.", "14.00", "side-coleslaw", 31),
  side("mac-and-cheese", "Mac and Cheese", "Southern comfort creamy pasta that never fails to impress.", "16.00", "side-mac-and-cheese", 32),
  side("smoked-beef-aglio-olio", "Smoked Beef Aglio Olio", "A classic aglio olio, pimped up with smoked beef.", "14.00", "side-aglio-olio", 33),
  side("stuffed-beef-mushrooms", "Stuffed Beef Mushrooms", "Mushrooms stuffed with smoked beef.", "16.00", "side-stuffed-mushrooms", 34),
  {
    ...side(
      "homemade-sauce-and-pickles",
      "Homemade Sauce and Pickles",
      "Tangy pickles with house-made barbecue and horseradish sauces.",
      "3.00",
      "side-sauce-and-pickles",
      35,
    ),
    load_units: 0.1,
  },

  // Christmas 2026 — names and prices from jettbarbecue.sg (Nov 2026).
  // ESTIMATES: rib_units and load_units, until the founder confirms platter contents.
  {
    slug: "signature-christmas-platter",
    name: "Signature Christmas Platter",
    description: "Our Christmas spread for home and small office gatherings: smoked USDA Prime beef ribs with festive sides.",
    category: "christmas",
    price: "255.00",
    image_path: "/images/christmas-platter.webp",
    serves: "Feeds 4",
    rib_units: 2,
    load_units: 1.5,
    available_from: SEASON_2026.from,
    available_to: SEASON_2026.to,
    is_active: true,
    sort_order: 1,
  },
  {
    slug: "everything-christmas-platter",
    name: "Everything Christmas Platter",
    description: "Everything we make for Christmas, for office parties and big hostings.",
    category: "christmas",
    price: "840.00",
    image_path: "/images/tray-meatballs.webp",
    serves: "Feeds 15",
    rib_units: 6,
    load_units: 4,
    available_from: SEASON_2026.from,
    available_to: SEASON_2026.to,
    is_active: true,
    sort_order: 2,
  },
  {
    slug: "extra-rib-christmas",
    name: "Extra Rib (Christmas)",
    description: "Add another smoked USDA Prime beef rib to your Christmas table.",
    category: "christmas",
    price: "97.50", // from Dec 2025 orders
    image_path: "/images/beef-rib-closeup.webp",
    serves: "Feeds 1.5–2.5",
    rib_units: 1,
    load_units: 0.5,
    available_from: SEASON_2026.from,
    available_to: SEASON_2026.to,
    is_active: true,
    sort_order: 3,
  },

  // Christmas 2025 — inactive; only so imported orders link to items with capacity/load data.
  // Prices derived from Dec 2025 single-item orders (total ÷ 1.09).
  past("christmas-new-years-set-2025", "Christmas/New Years Set", "240.00", 2, 1.5),
  past("christmas-set-2025", "Christmas Set", "240.00", 2, 1.5),
  past("new-years-set-2025", "New Years Set", "240.00", 2, 1.5),
  past("extra-rib-christmas-new-year-2025", "Extra Rib (Christmas/New Year)", "97.50", 1, 0.5),
  // ESTIMATE: too few single-item orders to derive a reliable price.
  past("sides-bundle-christmas-new-year-2025", "Sides Bundle (Christmas/New Year)", "75.00", 0, 1),
];

function side(slug: string, name: string, description: string, price: string, image: string, sort: number): MenuSeed {
  return {
    slug,
    name,
    description,
    category: "side",
    price,
    image_path: `/images/${image}.webp`,
    serves: null,
    rib_units: 0,
    load_units: 0.25,
    available_from: null,
    available_to: null,
    is_active: true,
    sort_order: sort,
  };
}

function past(slug: string, name: string, price: string, ribs: number, load: number): MenuSeed {
  return {
    slug,
    name,
    description: "Christmas 2025 menu item (archived).",
    category: "christmas",
    price,
    image_path: null,
    serves: null,
    rib_units: ribs,
    load_units: load,
    available_from: SEASON_2025.from,
    available_to: SEASON_2025.to,
    is_active: false,
    sort_order: 100,
  };
}

// Future slot templates (business-local wall-clock times). Capacities are placeholders, editable in admin.
export type SlotTemplate = { start: string; end: string; ribCapacity: number };

export const CHRISTMAS_2026 = {
  ...SEASON_2026,
  slots: [
    { start: "11:00", end: "12:30", ribCapacity: 40 },
    { start: "12:00", end: "13:30", ribCapacity: 40 },
    { start: "16:00", end: "17:30", ribCapacity: 60 },
    { start: "17:00", end: "18:30", ribCapacity: 120 },
    { start: "18:00", end: "19:30", ribCapacity: 120 },
  ] satisfies SlotTemplate[],
};

// Regular operating hours (order.jettbarbecue.sg footer): Fri 5–8pm; Sat & Sun 11am–1pm and 5–8pm.
export const REGULAR = {
  ranges: [
    { from: "2026-11-08", to: "2026-11-26" },
    { from: "2027-01-04", to: "2027-01-31" },
  ],
  byWeekday: {
    5: [
      { start: "17:00", end: "18:30", ribCapacity: 40 },
      { start: "18:30", end: "20:00", ribCapacity: 40 },
    ],
    6: [
      { start: "11:00", end: "13:00", ribCapacity: 30 },
      { start: "17:00", end: "18:30", ribCapacity: 40 },
      { start: "18:30", end: "20:00", ribCapacity: 40 },
    ],
    0: [
      { start: "11:00", end: "13:00", ribCapacity: 30 },
      { start: "17:00", end: "18:30", ribCapacity: 40 },
      { start: "18:30", end: "20:00", ribCapacity: 40 },
    ],
  } as Record<number, SlotTemplate[]>,
};
