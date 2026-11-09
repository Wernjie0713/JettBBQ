import type { OrderStatus } from "@/lib/admin-data";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

// docs/DESIGN.md §8 status badges: colour always paired with the label.
const STYLES: Record<OrderStatus, { label: string; variant: React.ComponentProps<typeof Badge>["variant"]; className?: string }> = {
  confirmed: { label: "Confirmed", variant: "secondary" },
  planned: { label: "Planned", variant: "info" },
  out_for_delivery: { label: "Out for delivery", variant: "ember" },
  delivered: { label: "Delivered", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "outline", className: "text-muted-foreground line-through" },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const style = STYLES[status];
  return (
    <Badge variant={style.variant} className={cn(style.className)}>
      {style.label}
    </Badge>
  );
}

export function orderStatusLabel(status: OrderStatus): string {
  return STYLES[status].label;
}
