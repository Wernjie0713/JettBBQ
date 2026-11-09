import type { Metadata } from "next";
import { fontVariables } from "@/lib/fonts";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "../globals.css";

export const metadata: Metadata = {
  title: {
    default: "Jett Barbecue Ops",
    template: "%s · Jett Ops",
  },
  robots: { index: false, follow: false },
};

// Admin, dispatch and driver root layout. Theme tokens: docs/DESIGN.md §8–9.
export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`theme-ops ${fontVariables} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
