"use client";

// Cart state. Only { id, qty } is stored in localStorage; names, prices and images always come
// from the current menu, so the cart never shows a stale price and drops items that are no
// longer on sale. place_order re-prices everything on the server anyway.

import { createContext, useContext, useMemo, useState, useSyncExternalStore } from "react";
import type { MenuItem } from "@/lib/menu";
import { MAX_CART_LINES as MAX_LINES, MAX_QTY_PER_ITEM as MAX_QTY } from "@/lib/order-limits";
import type { ShopSettings } from "@/lib/shop-settings";

const STORAGE_KEY = "jett-cart-v1";

type StoredLine = { id: string; qty: number };

// ---------------------------------------------------------------------------
// localStorage-backed external store
// ---------------------------------------------------------------------------
const EMPTY: StoredLine[] = [];
let stored: StoredLine[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

/** localStorage is user-controlled input: keep only well-formed lines. */
function parse(raw: string | null): StoredLine[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return EMPTY;
    return value
      .filter(
        (l): l is StoredLine =>
          typeof l?.id === "string" &&
          l.id.length <= 64 &&
          Number.isInteger(l.qty) &&
          l.qty >= 1 &&
          l.qty <= MAX_QTY,
      )
      .slice(0, MAX_LINES)
      .map((l) => ({ id: l.id, qty: l.qty }));
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): StoredLine[] {
  if (!loaded) {
    loaded = true;
    stored = parse(window.localStorage.getItem(STORAGE_KEY));
  }
  return stored;
}

const getServerSnapshot = () => EMPTY;

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Keep tabs in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return;
    stored = parse(event.newValue);
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function write(next: StoredLine[]) {
  stored = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    // Private mode / quota: the cart still works for this page view.
    console.error("Could not save cart to localStorage", error);
  }
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// React API
// ---------------------------------------------------------------------------
export type CartLine = { item: MenuItem; qty: number; lineCents: number };

type CartContextValue = {
  lines: CartLine[];
  count: number;
  subtotalCents: number;
  settings: ShopSettings;
  qtyOf: (id: string) => number;
  setQty: (id: string, qty: number) => void;
  add: (id: string) => void;
  clear: () => void;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({
  menu,
  settings,
  children,
}: {
  menu: MenuItem[];
  settings: ShopSettings;
  children: React.ReactNode;
}) {
  const storedLines = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [sheetOpen, setSheetOpen] = useState(false);

  const value = useMemo<CartContextValue>(() => {
    const byId = new Map(menu.map((item) => [item.id, item]));
    const lines: CartLine[] = [];
    for (const { id, qty } of storedLines) {
      const item = byId.get(id);
      if (item) lines.push({ item, qty, lineCents: item.priceCents * qty });
    }
    const current = () => getSnapshot().filter((l) => byId.has(l.id));
    const setQty = (id: string, qty: number) => {
      const next = Math.max(0, Math.min(MAX_QTY, Math.trunc(qty)));
      const rest = current().filter((l) => l.id !== id);
      if (next === 0) return write(rest);
      const existing = current().findIndex((l) => l.id === id);
      const updated = [...current()];
      if (existing >= 0) updated[existing] = { id, qty: next };
      else if (rest.length < MAX_LINES) updated.push({ id, qty: next });
      write(updated);
    };
    return {
      lines,
      count: lines.reduce((sum, l) => sum + l.qty, 0),
      subtotalCents: lines.reduce((sum, l) => sum + l.lineCents, 0),
      settings,
      qtyOf: (id) => storedLines.find((l) => l.id === id)?.qty ?? 0,
      setQty,
      add: (id) => setQty(id, (current().find((l) => l.id === id)?.qty ?? 0) + 1),
      clear: () => write(EMPTY),
      sheetOpen,
      setSheetOpen,
    };
  }, [menu, settings, storedLines, sheetOpen]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

const noopSubscribe = () => () => {};

/**
 * The server always renders an empty cart. A consumer inside a Suspense boundary can hydrate
 * after the provider has already loaded localStorage, so each consumer shows the empty cart
 * until it has hydrated itself (useSyncExternalStore uses the server snapshot during hydration).
 */
export function useCart(): CartContextValue {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart must be used inside <CartProvider>");
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  return hydrated ? value : { ...value, lines: [], count: 0, subtotalCents: 0, qtyOf: () => 0 };
}
