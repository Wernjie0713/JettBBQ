# Jett Barbecue — Design System

How the prototype looks and feels, and why. Companion to [ARCHITECTURE.md](ARCHITECTURE.md).

**One-line direction:** Grain's confident, image-led structure, dressed in Jett's own identity —
deep smoke-house red, charred black, warm bone, and an ember-gold call to action. Food photography
does the selling; the UI stays flat, sharp-cornered and quiet around it.

## 1. Principles

1. **Photo first.** Every customer page leads with real Jett photography. No stock images, no illustrations.
2. **Flat and sharp.** 2px corners, no drop shadows, no gradients except dark photo overlays (Grain does the same).
3. **Loud headlines, calm body.** Heavy condensed uppercase display type for headlines; light, readable body text.
4. **One call to action per view.** Ember-gold button = "the thing to do next". Never two gold buttons side by side.
5. **Two themes, one system.** *Shop* theme (customer pages) is expressive; *Ops* theme (admin, dispatch, driver)
   is the same tokens tuned for density and long working sessions.
6. **Colour never carries meaning alone.** Runs, statuses and capacity always pair colour with a number, label or icon.

## 2. Reference: what we take from Grain

Measured from grain.com.sg (computed styles, Nov 2026):

| Grain | Value | Jett adaptation |
|---|---|---|
| Display font | Kapra Neue Black (licensed), uppercase, 40px | **Anton** (free, Google Fonts), uppercase |
| Body/UI font | FunkisA (licensed), 300/400/700 | **DM Sans** (free, variable) |
| Editorial serif | Windsor 700 (licensed), 54px, used once per page | **Fraunces** (free, variable), used sparingly |
| Primary button | `#FECC07` yellow, black 16px bold, padding 8×24, radius 2px, no shadow | **Ember gold `#F4B41A`**, same shape |
| Page surface | warm grey-beige `#EAE6E1` | **Bone `#F5EFE8`** (warmer, matches logo skin tones) |
| Announcement bar | wine `#8B001E` | **Wine `#6B0A0C`** |
| Footer | black | **Char `#1C1412`** (warm black from the logo) |
| Radius | 2px everywhere, round only for icon buttons | Same |
| Shadows | none | Same |
| Content width | 1152px max, 900px text column | Same |
| Layout | full-bleed seasonal hero → 3 tall photo cards → testimonials → editorial line → footer | Same structure (§7) |
| Ordering | 3-step progress: Select menu → Select items → Check out, thin yellow progress line | Same pattern (§7.3) |

Licensed fonts are not copied; the free substitutes above give the same character.

## 3. Colour

### 3.1 Brand palette

| Token | Hex | OKLCH | Use |
|---|---|---|---|
| `jett-red` | `#980E0E` | `oklch(0.433 0.169 28.2)` | Brand surfaces (seasonal sections, header on red pages), price accents, links, focus ring. Exact logo red. |
| `wine` | `#6B0A0C` | `oklch(0.339 0.129 27.0)` | Announcement bar, hover on red surfaces |
| `ember` | `#F4B41A` | `oklch(0.808 0.162 81.9)` | **Primary CTA fill only**, progress bars, selected states |
| `ember-hover` | `#E0A20C` | `oklch(0.752 0.154 80.6)` | CTA hover |
| `char` | `#1C1412` | `oklch(0.201 0.014 34.4)` | Body text, footer, dark sections, ops primary button |
| `wood` | `#3A2A23` | `oklch(0.301 0.027 44.7)` | Secondary dark surface (cards on char) |
| `bone` | `#F5EFE8` | `oklch(0.955 0.011 71.9)` | Shop page background |
| `sand` | `#EAE0D5` | `oklch(0.912 0.018 70.2)` | Alternate section background, secondary buttons, hover |
| `card` | `#FFFCF8` | `oklch(0.992 0.006 75.4)` | Cards, inputs, sheets on the shop theme |
| `line` | `#DCCFC2` | `oklch(0.861 0.023 67.5)` | Borders and dividers (shop) |
| `stone` | `#6F625B` | `oklch(0.506 0.020 50.2)` | Muted text |

### 3.2 Status colours

| Token | Hex | OKLCH | Meaning |
|---|---|---|---|
| `success` | `#2E7D4F` | `oklch(0.529 0.106 154.6)` | Delivered, paid, slot available |
| `warning` | `#A16207` | `oklch(0.554 0.121 66.4)` | Few slots left, ETA at risk |
| `info` | `#2F5DA8` | `oklch(0.486 0.131 259.7)` | Planned / assigned |
| `destructive` | `#C0262D` | `oklch(0.527 0.189 24.7)` | Errors, failed delivery, cancel |

`destructive` is close in hue to `jett-red`, so **errors always carry an icon and explicit wording**, and
destructive buttons appear only in admin confirmations.

### 3.3 Contrast (checked, WCAG)

| Pair | Ratio | Verdict |
|---|---|---|
| char on bone | 15.9 | body text ✓ |
| stone on bone / card / sand | 5.2 / 5.7 / 4.5 | muted text ✓ (AA) |
| char on ember | 9.8 | CTA label ✓ |
| white on jett-red / wine | 8.7 / 12.6 | text on red ✓ |
| jett-red on bone | 7.7 | red text/links ✓ |
| white on success / info / destructive / warning | 5.1 / 6.5 / 5.9 / 4.9 | badges ✓ |
| **ember on bone** | **1.6** | ✗ — **never use ember as text or thin lines on light backgrounds** |

### 3.4 Run colours (dispatch map)

Twelve distinguishable colours, assigned in order to Run 1…12 (cycle after 12). Every marker also shows the run number.

```
#1F77B4 blue    #2CA02C green   #FF7F0E orange  #9467BD purple
#17BECF cyan    #8C564B brown   #E377C2 pink    #BCBD22 olive
#0B3C5D navy    #00A087 teal    #7F7F7F grey    #D62728 red
```

Keep them in one TypeScript constant (`lib/run-colors.ts`); Leaflet needs raw values, not CSS variables.

## 4. Typography

Loaded with `next/font/google` (self-hosted at build time, no layout shift), exposed as CSS variables.

| Role | Font | Weights | Variable |
|---|---|---|---|
| Display | **Anton** | 400 (it is already black-weight) | `--font-anton` → `font-display` |
| Body / UI | **DM Sans** | variable, 300–800 | `--font-dm-sans` → `font-sans` (default) |
| Editorial accent | **Fraunces** | variable, 600–700, optical size on | `--font-fraunces` → `font-serif` |

### 4.1 Shop type scale

| Style | Font | Size / line-height | Notes |
|---|---|---|---|
| Hero | Anton, uppercase | `clamp(3rem, 7vw, 5.5rem)` / 0.95 | max 3 lines, tracking `0.01em` |
| Section title (H2) | Anton, uppercase | 40px / 48px (32px mobile) | centred on marketing sections |
| Card title (photo cards) | Anton, uppercase | 32–40px / 1.05 | white over photo |
| Item title (H3) | DM Sans 700 | 18–20px / 28px | menu items, summary rows |
| Editorial line | Fraunces 700 | 40–54px / 1.1 | max **one** per page (e.g. testimonials heading) |
| Body large | DM Sans 300 | 18px / 28px | intros, testimonials (Grain uses light 18px) |
| Body | DM Sans 400 | 16px / 24px | default |
| Small | DM Sans 400 | 14px / 20px | helper text, footer links |
| Eyebrow / tagline | DM Sans 500, uppercase | 12–13px, tracking `0.3em` | echoes the logo's "MEAT \| SMOKE \| LOVE" |
| Price | DM Sans 700, `tabular-nums` | 18–20px | "before GST" shown beside it in Small/stone |
| Button | DM Sans 700 | 16px / 24px | sentence case (not uppercase), like Grain |

### 4.2 Ops type scale

DM Sans only (Anton is reserved for the logo lockup). Base 14px. Tables 14px, KPI values 28px/700 `tabular-nums`,
labels 12px uppercase tracking `0.08em` in muted colour. Driver page uses 16–18px base for outdoor readability.

## 5. Layout & spacing

- **Containers:** content `max-w-[72rem]` (1152px); reading/forms `max-w-[56.25rem]` (900px); checkout form column 640px.
- **Gutters:** 16px mobile, 24px ≥ 768px, 32px ≥ 1024px.
- **Section rhythm:** 64px vertical padding on mobile, 96px on desktop. Alternate `bone` and `sand` (or a full-bleed photo/char section) to separate sections — no divider lines between marketing sections.
- **Grid:** photo cards 1 col mobile → 3 cols ≥ 1024px, 16px gap. Menu grid 1 → 2 (≥ 640px) → 3 (≥ 1024px), 24px gap.
- **Spacing scale:** Tailwind default 4px scale; use `gap-*`, not `space-*` (shadcn rule).
- **Breakpoints:** Tailwind defaults (`sm 640`, `md 768`, `lg 1024`, `xl 1280`). Design mobile first — most orders come from phones.
- **Ops layout:** full width, shadcn `Sidebar` (240px, collapsible to icons) + content; dispatch uses the whole viewport.

## 6. Radius, borders, elevation, motion

| | Shop | Ops |
|---|---|---|
| `--radius` | `0.125rem` (2px) | `0.375rem` (6px) |
| Borders | 1px `line`, used sparingly (inputs, menu cards) | 1px ops border on cards, tables, inputs |
| Shadows | none (do not add `shadow-*`) | none on cards; overlays keep shadcn defaults |
| Round shapes | icon buttons, WhatsApp float, avatar, map markers only | same |

**Motion:** 150–200ms `ease-out` for hover/press; photo cards zoom image to `scale-[1.03]` over 500ms on hover;
sheets/dialogs use shadcn defaults; checkout progress line animates width 300ms. Wrap all non-essential motion in
`motion-safe:`; no parallax, no auto-playing carousels faster than 6s.

**Photo overlays:** `bg-gradient-to-t from-char/75 via-char/25 to-transparent` behind any text on photos.

## 7. Pages (shop)

### 7.1 Global chrome
- **Announcement bar** — `wine` background, white 14px, centred, one link. e.g. *"Christmas platters are open · 27 Nov – 3 Jan · Free delivery from $195"*.
- **Header** — 72px. Transparent over the hero with white text; after scrolling becomes `bone` with `char` text.
  Left: logo lockup (round face mark 36px + "JETT BARBECUE" in DM Sans 800 tracking `0.04em`). Centre/left: nav
  (Barbecue Sets · Christmas · Catering · FAQ). Right: cart button with count badge + gold "Order now".
  Mobile: logo + cart + menu (shadcn `Sheet` from the left).
- **Footer** — `char` background, `bone` text. Columns: Order · Help (FAQ, Reheat guide, Delivery) · Contact
  (WhatsApp, email, Instagram). Tagline in eyebrow style. Small print in `stone`-on-char equivalent (`bone/60`).
- **WhatsApp float** — 56px circle, `#25D366`, bottom-right, 24px offset (Jett relies on WhatsApp orders).

### 7.2 Home `/`
1. **Hero** — full-bleed photo, 88vh desktop / 75vh mobile. Year-round: `20241013 Jett BBQ1033` (landscape spread)
   on desktop, `1037 2` (portrait spread) on mobile. Seasonal (Christmas): red-cloth tray photos. Anton headline,
   Body-large subline, gold CTA "Order now" + inverse outline "Christmas menu (PDF)".
2. **Product lines** — three tall photo cards (aspect 3:5 on desktop, like Grain's 319×534): *Barbecue Sets* · *Christmas Platters* · *Catering & Events*.
   Anton title, one-line description, outline button on the photo. Whole card is the link.
3. **Why Jett** — `sand` strip, four facts with icons: Smoked 8–14 hours · 800-gallon smoker · USDA Prime beef · Free delivery from $195.
4. **Press** — the page's one Fraunces editorial heading, then CNA, 8 Days and Eatbook as wordmarks in DM Sans 700
   (no logo files available), each with its headline in Body-large and a link to the article.
5. **Watch / follow** — YouTube features as dark cards and an Instagram CTA, on `wood`.

### 7.3 Order `/order` and Checkout `/checkout`
- **Menu is always visible.** Seasonal items show a `Badge` "Christmas · 27 Nov – 3 Jan" and are only blocked at slot selection, so customers can browse everything before choosing a date.
- **Category bar** — sticky under the header; anchor links (scrollable on mobile, no scrollbar): Sets · Christmas · Extra ribs · Sides.
- **Menu item card** — `card` background, 1px `line` border, 2px radius. Image 4:3 on top (no padding), then title (H3),
  two-line description (`line-clamp-2`, stone), servings hint ("Feeds 3–5"), price + "before GST", and a gold
  "Add" button that turns into a quantity stepper once added.
- **Cart** — shadcn `Sheet` from the right: full width on phones, 420px from `sm` up. Sticky mobile bar:
  "3 items · $xxx.xx · View cart". Includes a **free-delivery progress bar** ("Add $26.00 more for free delivery") in ember on sand.
- **"How much should I order?" helper** (AI) — not built. Planned as a compact banner above the menu: Fraunces lead
  line + headcount input + "Suggest".
- **Checkout steps** — Grain-style progress: three labels "1 · Delivery  2 · Details  3 · Review & pay" over a 4px
  track (`sand`) with an ember fill. Two columns on desktop: form left (640px), sticky order summary right.
  - *Delivery:* postal code (`InputGroup` + "Find" button → address autofill), unit number, then **date** (`Calendar`:
    closed days disabled, full days struck through, low-capacity days marked with a warning dot) and **time slot**
    (`ToggleGroup` of slot cards: time window in DM Sans 700 + capacity label "Available" / "3 left" / "Full";
    selected = 2px ember border + sand fill, full = disabled).
  - *Details:* name, email, phone (+65 prefix), notes.
  - *Review & pay:* summary, fee and GST breakdown, gold full-width button "Pay $xxx.xx" with an `Alert`
    "Demo payment — no card is charged."

### 7.4 Tracking `/track/[token]`
Big ETA window in Anton ("5:20 – 5:40 PM") once routed, otherwise the slot window. Vertical status timeline
(Confirmed → Planned → Out for delivery → Delivered) with icons; current step in ember, done steps in success.
Order summary and WhatsApp help link below.

## 8. Ops theme (admin, dispatch, driver)

- **Surfaces:** background `#FAF8F6`, cards white, border `#E7E1DB`, primary button **char** with white text,
  secondary = sand, radius 6px. Brand appears in the sidebar logo and a 3px `jett-red` indicator on the active nav item.
- **Date navigation** — ‹ date › arrows with a date input on Overview and Dispatch; a date-range button opening a
  two-month `Calendar` in a `Popover` on Delivery slots (up to 31 days; the arrows move by the range length).
- **Overview** — KPI `Card`s (label / value / sub-text), then a table of the day's slots with capacity bars and revenue.
- **Orders** — shadcn `Table` with sticky header, 44px rows, `tabular-nums`, status `Badge`, filters in a toolbar,
  and a footer "Showing 51–100 of 2,006 orders" with ‹ Previous / Next › (cursor pagination, see ARCHITECTURE.md §8).
- **Status badges:**

  | Status | Style |
  |---|---|
  | Confirmed | `secondary` (sand) |
  | Planned | `info` |
  | Out for delivery | ember fill, char text |
  | Delivered | `success` |
  | Failed | `destructive` |
  | Cancelled | `outline`, muted, strikethrough label |

- **Dispatch** — full-height three-zone layout on wide screens (runs · map · copilot), stacking on smaller ones:
  - *Toolbar (top):* date navigation, slot buttons with order counts, **Optimise routes** (primary; "Re-optimise"
    asks for confirmation once a plan exists), "Show baseline routes on the map" `Switch`, then a metric strip of
    KPI cards: Cars needed · Total km · On time · Saved vs baseline.
  - *Runs panel (left, 340–360px, scrolls on its own):* one card per run — colour swatch + "Run 3", stops, load bar
    (used / capacity), km, departure → last ETA, driver fields (name, phone, plate), "Copy driver link".
    Expanding a run lists stops in order; each stop has a **Move to** menu (`DropdownMenu`) to send it to another run.
  - *Map (centre):* OneMap **Grey** basemap so run colours stand out. Depot = 40px round Jett face marker.
    Stops = 26px circles filled with run colour, white 2px stroke, white sequence number. Routes = 4px polylines
    at 85% opacity; selecting a run dims the others to 25%.
  - *AI copilot (right panel, 320px):* chat layout; user messages right on sand, AI replies left with a
    sparkle icon and "AI" label, applied constraints shown as outline `Badge` chips with an "Undo" action, loading
    via `Skeleton`. AI text never replaces the numbers — metrics always come from the optimiser.
- **Insights** — KPI cards, shadcn `Chart` (Recharts): orders by day (bar), orders by delivery window (horizontal bar),
  a "cars to pre-book" table for the peak slots, a top-areas list with bars, and the AI briefing in a `Card` with the sparkle label.
  Chart colours: `--chart-1` jett-red, `--chart-2` ember, `--chart-3` info, `--chart-4` success, `--chart-5` stone.
- **Driver page `/run/[token]`** — mobile only, white background, 16–18px text. Header: run number + colour + stop "3 of 9".
  Current stop card emphasised (address in 20px/700, unit, notes). Full-width 56px buttons: **Navigate** (char),
  **Call** (outline), **Delivered** (success), **Can't deliver** (outline destructive → reason dialog).

## 9. shadcn/ui: reuse vs customise

shadcn's default look (neutral greys, ~10px radius, small 14px medium-weight buttons, subtle shadows) differs from Grain
mainly in **colour, corner radius, button weight/size and typography**. All of that is handled by **tokens**, not by
rewriting components.

### 9.1 Approach
1. `npx shadcn@latest init` (Next.js, Tailwind v4, CSS variables). Light mode only — no `.dark` theme.
2. Two route groups with their own root layouts, each setting a theme class on `<html>`:
   `app/(shop)/layout.tsx` → `theme-shop`; `app/(ops)/layout.tsx` → `theme-ops`.
   Putting the class on `<html>` (not a wrapper `div`) matters: Dialog, Sheet, Popover and Select render in portals
   attached to `<body>` and would otherwise lose the theme.
3. Define tokens once in `app/globals.css` (sketch below).
4. Edit only `components/ui/button.tsx` and `components/ui/badge.tsx` to add variants (§9.3). Everything else as-is.

### 9.2 Token sketch (`app/globals.css`)

```css
:root, .theme-shop {
  --radius: 0.125rem;
  --background: oklch(0.955 0.011 71.9);        /* bone */
  --foreground: oklch(0.201 0.014 34.4);        /* char */
  --card: oklch(0.992 0.006 75.4);
  --card-foreground: oklch(0.201 0.014 34.4);
  --popover: oklch(0.992 0.006 75.4);
  --popover-foreground: oklch(0.201 0.014 34.4);
  --primary: oklch(0.808 0.162 81.9);           /* ember */
  --primary-foreground: oklch(0.201 0.014 34.4);
  --secondary: oklch(0.912 0.018 70.2);         /* sand */
  --secondary-foreground: oklch(0.201 0.014 34.4);
  --muted: oklch(0.912 0.018 70.2);
  --muted-foreground: oklch(0.506 0.020 50.2);  /* stone */
  --accent: oklch(0.912 0.018 70.2);
  --accent-foreground: oklch(0.201 0.014 34.4);
  --destructive: oklch(0.527 0.189 24.7);
  --border: oklch(0.861 0.023 67.5);            /* line */
  --input: oklch(0.861 0.023 67.5);
  --ring: oklch(0.433 0.169 28.2);              /* jett-red: visible focus on bone */
  --brand: oklch(0.433 0.169 28.2);             /* jett-red */
  --brand-foreground: oklch(1 0 0);
  --wine: oklch(0.339 0.129 27.0);
  --char: oklch(0.201 0.014 34.4);
  --success: oklch(0.529 0.106 154.6);
  --warning: oklch(0.554 0.121 66.4);
  --info: oklch(0.486 0.131 259.7);
  --chart-1: oklch(0.433 0.169 28.2);
  --chart-2: oklch(0.808 0.162 81.9);
  --chart-3: oklch(0.486 0.131 259.7);
  --chart-4: oklch(0.529 0.106 154.6);
  --chart-5: oklch(0.506 0.020 50.2);
}

.theme-ops {
  --radius: 0.375rem;
  --background: oklch(0.980 0.003 67.8);
  --card: oklch(1 0 0);
  --popover: oklch(1 0 0);
  --primary: oklch(0.201 0.014 34.4);           /* char */
  --primary-foreground: oklch(1 0 0);
  --border: oklch(0.913 0.010 67.7);
  --input: oklch(0.913 0.010 67.7);
  --ring: oklch(0.201 0.014 34.4);
  /* sidebar-* tokens: white background, char text, sand hover */
}

@theme inline {
  --font-sans: var(--font-dm-sans);
  --font-display: var(--font-anton);
  --font-serif: var(--font-fraunces);
  --color-brand: var(--brand);
  --color-brand-foreground: var(--brand-foreground);
  --color-wine: var(--wine);
  --color-char: var(--char);
  --color-success: var(--success);
  --color-warning: var(--warning);
  --color-info: var(--info);
  /* shadcn init already maps background/primary/…/radius here */
}
```

Values not repeated in `.theme-ops` inherit from `:root`.

### 9.3 Component changes

| Component | Change | Why |
|---|---|---|
| `Button` | Add size `cta`: `h-12 px-6 text-base font-bold`. Add variants `brand` (jett-red bg, white text) and `inverse` (transparent, white text, 1px white border — for photos and dark sections). | Grain's buttons are larger and bolder than shadcn's; we need buttons that work on photos and red sections. |
| `Badge` | Add variants `success`, `warning`, `info`, `ember`. | Order/run statuses. |
| Everything else | Use as-is; only tokens change. | Keep upgrades easy. |

### 9.4 Components used

| Area | shadcn components | Custom components (ours) |
|---|---|---|
| Shop | Button, Badge, Sheet, Calendar, ToggleGroup, Field, Input, InputGroup, Textarea, Alert, Separator, Skeleton, Spinner, Sonner | AnnouncementBar, SiteHeader, SiteFooter, CartSheet, MobileCartBar, MenuItemCard, QuantityStepper, FreeDeliveryProgress, WhatsAppFab, CheckoutForm (progress, slot cards, summary), tracking timeline |
| Ops | Sidebar, Card, Table, Badge, Button, Input, Select, Switch, Calendar, Popover, DropdownMenu, AlertDialog, Tooltip, Chart, Field, InputGroup, Textarea, Alert, Skeleton, Spinner, Empty, Sonner | AdminSidebar, PageHeader, DayNav, CapacityBar, OrderStatusBadge, DispatchBoard, RunCard, RouteMap, CopilotPanel, BriefingCard, RangePicker, DriverRun |

Icons: the library chosen by `shadcn init` (Lucide by default), 1.5px stroke, sized by the components.

## 10. Imagery

- **Year-round set (dark wood, warm light):** files `20241013 Jett BBQ*`. Hero `1033` (landscape) / `1037 2` (portrait);
  Beef Rib Set `1009`; extra rib `1018`; mashed potato `0942`; mac & cheese `0958`; aglio olio `0962`; coleslaw `0968`;
  stuffed mushrooms `0977`; sauce & pickles `0983`.
- **Christmas set (red cloth, top-down trays):** `Jett Barbecue Christmas Set.jpeg` and the six WhatsApp tray photos —
  use for the Christmas hero, Christmas product card and seasonal menu items. Their red background suits `jett-red` sections.
- **Processing:** originals are 30 MB; export WebP to `public/images/` at ≤ 1600px long edge (hero 2400px), quality ~80.
  Always use `next/image` with `sizes`, meaningful `alt` text, and `priority` only on the hero.
- **Crops:** photo cards 3:5, menu items 4:3, hero 16:9 desktop / 4:5 mobile.

## 11. Voice & microcopy

Warm, short, a little playful — like the founder talking. Sentence case for buttons ("Order now", "Add to cart").
Uppercase only in Anton headlines and eyebrows. Prices always show "before GST" on menus and the GST line at checkout.
Errors say what happened and what to do ("That slot just filled up — pick another time below.").

## 12. Accessibility checklist

- Text contrast ≥ 4.5:1 (all token pairs above pass; ember is never text on light backgrounds).
- Visible focus ring (`--ring`) on every interactive element; never remove outlines.
- Touch targets ≥ 44px (shop and driver), ≥ 36px (ops desktop).
- Statuses, runs and capacity always include text or numbers, not colour alone.
- Respect `prefers-reduced-motion`.
- Overlays always have a title (`SheetTitle`, `DialogTitle`), visually hidden if needed.
