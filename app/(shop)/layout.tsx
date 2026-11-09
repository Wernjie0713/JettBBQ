import type { Metadata } from "next";
import { Suspense } from "react";
import { fontVariables } from "@/lib/fonts";
import { getMenu } from "@/lib/menu";
import { getShopSettings } from "@/lib/shop-settings";
import { AnnouncementBar } from "@/components/shop/announcement-bar";
import { CartProvider } from "@/components/shop/cart";
import { CartSheet } from "@/components/shop/cart-sheet";
import { SiteFooter } from "@/components/shop/site-footer";
import { SiteHeader, SiteHeaderFallback } from "@/components/shop/site-header";
import { WhatsAppFab } from "@/components/shop/whatsapp-fab";
import { Toaster } from "@/components/ui/sonner";
import "../globals.css";

export const metadata: Metadata = {
  title: {
    default: "Jett Barbecue — Texas-style smoked USDA Prime beef ribs",
    template: "%s · Jett Barbecue",
  },
  description:
    "Texas-style smoked USDA Prime beef ribs, delivered to your door in Singapore.",
};

// Customer-facing root layout. Theme tokens: docs/DESIGN.md §9.
// Menu and settings are cached ('use cache'), so this layout is still prerendered.
export default async function ShopLayout({ children }: { children: React.ReactNode }) {
  const [menu, settings] = await Promise.all([getMenu(), getShopSettings()]);

  return (
    <html lang="en" className={`theme-shop ${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <CartProvider menu={menu} settings={settings}>
          <AnnouncementBar />
          {/* usePathname suspends on routes with unknown params (e.g. /track/[token]). */}
          <Suspense fallback={<SiteHeaderFallback />}>
            <SiteHeader />
          </Suspense>
          <main className="flex flex-1 flex-col">{children}</main>
          <SiteFooter />
          <CartSheet />
          <Suspense>
            <WhatsAppFab />
          </Suspense>
        </CartProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
