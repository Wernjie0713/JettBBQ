import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { AdminSidebar } from "@/components/ops/admin-sidebar";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

// Back-office shell. The session is read inside Suspense boundaries (account label here, data in
// each page), so the shell itself stays static. Each page calls requireAdmin() for its data.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AdminSidebar
        account={
          <Suspense fallback={null}>
            <AdminEmail />
          </Suspense>
        }
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

async function AdminEmail() {
  const { admin } = await requireAdmin();
  return admin.email;
}
