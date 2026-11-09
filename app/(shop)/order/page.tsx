import type { Metadata } from "next";
import { getMenu, MENU_SECTIONS } from "@/lib/menu";
import { MenuItemCard } from "@/components/shop/menu-item-card";
import { MobileCartBar } from "@/components/shop/mobile-cart-bar";

export const metadata: Metadata = { title: "Order" };

// The full menu is always visible (seasonal items carry their dates); availability is only
// checked when the customer picks a delivery slot. docs/DESIGN.md §7.3.
export default async function OrderPage() {
  const menu = await getMenu();
  const sections = MENU_SECTIONS.map((section) => ({
    ...section,
    items: menu.filter((item) => item.category === section.category),
  })).filter((section) => section.items.length > 0);

  return (
    <>
      <div className="px-4 pt-12 pb-8 md:px-6 md:pt-16 lg:px-8">
        <div className="mx-auto flex max-w-[72rem] flex-col gap-3">
          <p className="text-xs font-medium tracking-[0.3em] text-muted-foreground uppercase">Meat | Smoke | Love</p>
          <h1 className="font-display text-5xl uppercase md:text-6xl">The menu</h1>
          <p className="max-w-2xl text-lg font-light">
            Order at least 24 hours ahead (3 days for Christmas platters). Prices are before GST; delivery is free
            from $195.
          </p>
        </div>
      </div>

      <nav
        aria-label="Menu categories"
        className="sticky top-18 z-30 border-y bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80"
      >
        {/* Gutter minus the links' 12px padding, so the first label sits on the page's content edge. */}
        <ul className="no-scrollbar mx-auto flex max-w-[76rem] gap-1 overflow-x-auto px-1 md:px-3 lg:px-5">
          {sections.map((section) => (
            <li key={section.id} className="shrink-0">
              <a
                href={`#${section.id}`}
                className="inline-flex h-12 items-center px-3 text-sm font-bold whitespace-nowrap hover:text-brand"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-col gap-16 px-4 py-12 md:px-6 md:py-16 lg:px-8">
        {sections.map((section, sectionIndex) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className="mx-auto flex w-full max-w-[72rem] scroll-mt-36 flex-col gap-6"
          >
            <h2 id={`${section.id}-title`} className="font-display text-[2rem] uppercase md:text-[2.5rem]">
              {section.label}
            </h2>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {section.items.map((item, index) => (
                <MenuItemCard key={item.id} item={item} priority={sectionIndex === 0 && index < 3} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <MobileCartBar />
    </>
  );
}
