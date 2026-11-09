"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import {
  CalendarClockIcon,
  ExternalLinkIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ReceiptTextIcon,
  RouteIcon,
  SettingsIcon,
  TrendingUpIcon,
} from "lucide-react";
import { signOut } from "@/app/(ops)/admin/auth-actions";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboardIcon },
  { href: "/admin/orders", label: "Orders", icon: ReceiptTextIcon },
  { href: "/admin/dispatch", label: "Dispatch", icon: RouteIcon },
  { href: "/admin/insights", label: "Insights", icon: TrendingUpIcon },
  { href: "/admin/slots", label: "Delivery slots", icon: CalendarClockIcon },
  { href: "/admin/settings", label: "Settings", icon: SettingsIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminSidebar({ account }: { account: React.ReactNode }) {
  return (
    <Sidebar collapsible="icon">
      {/* Same 48px height and bottom border as the top bar; as a menu button the logo lines up with
          the nav icons below, both expanded and collapsed. */}
      <SidebarHeader className="h-12 justify-center border-b py-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg" className="h-10">
              <Link href="/admin">
                <Image src="/images/logo.webp" alt="" width={32} height={32} className="size-8 shrink-0 rounded-full" />
                <span className="font-bold">Jett Barbecue Ops</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarNav />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="View shop">
              <a href="/" target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon />
                <span>View shop</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <form action={signOut}>
              <SidebarMenuButton type="submit" tooltip="Sign out">
                <LogOutIcon />
                <span className="flex min-w-0 flex-col">
                  <span>Sign out</span>
                  <span className="truncate text-xs text-muted-foreground">{account}</span>
                </span>
              </SidebarMenuButton>
            </form>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

// usePathname suspends on routes with unknown params (e.g. /admin/orders/[id]); the fallback
// renders the same links without the active marker.
function SidebarNav() {
  return (
    <Suspense fallback={<NavList pathname="" />}>
      <ActiveNav />
    </Suspense>
  );
}

function ActiveNav() {
  return <NavList pathname={usePathname()} />;
}

function NavList({ pathname }: { pathname: string }) {
  return (
    <SidebarMenu>
      {NAV.map(({ href, label, icon: Icon }) => (
        <SidebarMenuItem key={href}>
          <SidebarMenuButton
            asChild
            isActive={isActive(pathname, href)}
            tooltip={label}
            // 3px Jett-red indicator on the active item (docs/DESIGN.md §8).
            className="data-[active=true]:shadow-[inset_3px_0_0_var(--brand)]"
          >
            <Link href={href}>
              <Icon />
              <span>{label}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
