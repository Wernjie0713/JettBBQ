import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import { NotFoundMessage } from "@/components/shop/not-found-message";
import "./globals.css";

export const metadata: Metadata = {
  title: "Page not found · Jett Barbecue",
};

// Needed because the app has two root layouts, (shop) and (ops).
export default function GlobalNotFound() {
  return (
    <html lang="en" className={`theme-shop ${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <NotFoundMessage />
      </body>
    </html>
  );
}
