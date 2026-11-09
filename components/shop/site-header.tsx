"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { MenuIcon, ShoppingBagIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { SITE } from "@/lib/site";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCart } from "./cart";

const NAV = [
  { href: "/order#sets", label: "Barbecue sets", external: false },
  { href: "/order#christmas", label: "Christmas", external: false },
  { href: SITE.cateringUrl, label: "Catering", external: true },
  { href: SITE.faqUrl, label: "FAQ", external: true },
];

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

function useScrolled() {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 16,
    () => false,
  );
}

function Logo() {
  return (
    <Link href="/" className="flex shrink-0 items-center gap-2.5">
      <Image src="/images/logo.webp" alt="" width={36} height={36} className="size-9 rounded-full" />
      <span className="text-base font-extrabold tracking-[0.04em]">JETT BARBECUE</span>
    </Link>
  );
}

function NavLink({ href, label, external, className }: (typeof NAV)[number] & { className?: string }) {
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {label}
    </a>
  ) : (
    <Link href={href} className={className}>
      {label}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const scrolled = useScrolled();
  const { count, setSheetOpen } = useCart();

  // Transparent over the home hero until the user scrolls (docs/DESIGN.md §7.1).
  const overHero = pathname === "/" && !scrolled;
  // One gold call to action per view: the hero and the menu pages already have their own.
  const showOrderNow = !overHero && !pathname.startsWith("/order") && !pathname.startsWith("/checkout");

  return (
    <header
      className={cn(
        "sticky top-0 z-40 h-18 motion-safe:transition-colors motion-safe:duration-200",
        overHero ? "bg-transparent text-white" : "border-b bg-background text-foreground",
      )}
    >
      {/* 76rem = the 72rem content width + the lg gutters, so the logo lines up with page sections,
          which pad outside their 72rem box. */}
      <div className="mx-auto flex h-full max-w-[76rem] items-center gap-2 px-4 md:px-6 lg:gap-8 lg:px-8">
        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              // Pull the 44px tap target out so the icon itself sits on the content edge.
              className={cn("-ml-3.5 size-11 lg:hidden", overHero && "hover:bg-white/15 hover:text-white")}
              aria-label="Open menu"
            >
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="gap-0">
            <SheetHeader className="border-b px-6 py-5">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Logo />
            </SheetHeader>
            <nav className="flex flex-col p-2">
              {NAV.map((link) => (
                <NavLink
                  key={link.href}
                  {...link}
                  className="rounded-sm px-4 py-3 text-lg font-medium hover:bg-muted"
                />
              ))}
            </nav>
          </SheetContent>
        </Sheet>

        <Logo />

        <nav className="hidden items-center gap-6 text-sm font-medium lg:flex">
          {NAV.map((link) => (
            <NavLink key={link.href} {...link} className="underline-offset-8 hover:underline" />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "relative -mr-3 size-11",
              showOrderNow && "sm:mr-0",
              overHero && "hover:bg-white/15 hover:text-white",
            )}
            onClick={() => setSheetOpen(true)}
            aria-label={`Open cart, ${count} ${count === 1 ? "item" : "items"}`}
          >
            <ShoppingBagIcon className="size-5" />
            {count > 0 && (
              <span className="absolute top-1 right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-brand px-1 text-[11px] font-bold text-brand-foreground tabular-nums">
                {count}
              </span>
            )}
          </Button>
          {showOrderNow && (
            <Button asChild className="hidden h-10 px-5 font-bold sm:inline-flex">
              <Link href="/order">Order now</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

/** Static stand-in while the pathname is unknown during prerendering (routes with dynamic params). */
export function SiteHeaderFallback() {
  return (
    <header className="sticky top-0 z-40 h-18 border-b bg-background">
      <div className="mx-auto flex h-full max-w-[76rem] items-center px-4 md:px-6 lg:px-8">
        <Logo />
      </div>
    </header>
  );
}
