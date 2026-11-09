// Parser for the founder's anonymised order export (data/orders-dec2025-anonymised.csv).
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";

export type CsvOrderItem = { name: string; qty: number };

export type CsvOrder = {
  code: string;
  orderDate: string; // YYYY-MM-DD (business date)
  servingDate: string; // YYYY-MM-DD (business date)
  slotStart: string; // HH:mm
  slotEnd: string; // HH:mm
  total: string; // decimal string, never a float
  paymentType: string;
  addressLine1: string;
  addressLine2: string;
  postalCode: string;
  contactName: string;
  contactEmail: string;
  contactNumber: string;
  notes: string;
  items: CsvOrderItem[];
};

// The ordering platform listed an info card as a product; it is not a real item.
const NON_PRODUCT_ITEMS = new Set(["How to order for Christmas!"]);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONEY_RE = /^\d+(\.\d{1,2})?$/;
const POSTAL_RE = /^\d{6}$/;
const SLOT_RE = /^(\d{1,2}):(\d{2})\s*(AM|PM)\s*[–-]\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i;

function to24h(hour: string, minute: string, meridiem: string): string {
  let h = Number(hour) % 12;
  if (meridiem.toUpperCase() === "PM") h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

export function parseTimeslot(value: string): { start: string; end: string } | null {
  const m = SLOT_RE.exec(value.trim());
  if (!m) return null;
  return { start: to24h(m[1], m[2], m[3]), end: to24h(m[4], m[5], m[6]) };
}

function parseItems(value: string): { items: CsvOrderItem[]; errors: string[] } {
  const items: CsvOrderItem[] = [];
  const errors: string[] = [];
  for (const raw of value.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^(\d+)\s*x\s*(.+)$/.exec(line);
    if (!m) {
      errors.push(`unparsed item line "${line}"`);
      continue;
    }
    const name = m[2].trim();
    if (NON_PRODUCT_ITEMS.has(name)) continue;
    items.push({ name, qty: Number(m[1]) });
  }
  return { items, errors };
}

export function readOrdersCsv(path: string): { orders: CsvOrder[]; skipped: string[] } {
  const records: Record<string, string>[] = parse(readFileSync(path), {
    columns: true,
    bom: true,
    skip_empty_lines: true,
    trim: false,
  });

  const orders: CsvOrder[] = [];
  const skipped: string[] = [];

  for (const r of records) {
    const code = (r["Order ID"] ?? "").trim();
    const slot = parseTimeslot(r["Timeslot"] ?? "");
    const total = (r["Total including tax"] ?? "").trim();
    const postalCode = (r["Postal code"] ?? "").trim();
    const orderDate = (r["Order date"] ?? "").trim();
    const servingDate = (r["Serving date"] ?? "").trim();
    const { items, errors } = parseItems(r["Items"] ?? "");

    const problems = [
      !code && "missing Order ID",
      !slot && `bad timeslot "${r["Timeslot"]}"`,
      !MONEY_RE.test(total) && `bad total "${total}"`,
      !POSTAL_RE.test(postalCode) && `bad postal code "${postalCode}"`,
      !DATE_RE.test(orderDate) && `bad order date "${orderDate}"`,
      !DATE_RE.test(servingDate) && `bad serving date "${servingDate}"`,
      items.length === 0 && "no items",
      ...errors,
    ].filter(Boolean);

    if (problems.length > 0 || !slot) {
      skipped.push(`${code || "(no id)"}: ${problems.join("; ")}`);
      continue;
    }

    orders.push({
      code,
      orderDate,
      servingDate,
      slotStart: slot.start,
      slotEnd: slot.end,
      total,
      paymentType: (r["Payment type"] ?? "").trim(),
      addressLine1: (r["Address line 1"] ?? "").trim(),
      addressLine2: (r["Address line 2"] ?? "").trim(),
      postalCode,
      contactName: (r["Contact name"] ?? "").trim(),
      contactEmail: (r["Contact email"] ?? "").trim(),
      contactNumber: (r["Contact number"] ?? "").trim(),
      notes: (r["Notes"] ?? "").trim(),
      items,
    });
  }

  return { orders, skipped };
}
