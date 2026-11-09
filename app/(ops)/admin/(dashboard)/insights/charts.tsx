"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { formatServiceDate } from "@/lib/format";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const ordersConfig = { orders: { label: "Orders", color: "var(--chart-1)" } } satisfies ChartConfig;
const windowConfig = { orders: { label: "Orders", color: "var(--chart-2)" } } satisfies ChartConfig;

export function OrdersByDayChart({ data }: { data: { date: string; orders: number }[] }) {
  return (
    <ChartContainer config={ordersConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={(d: string) => String(Number(d.slice(8)))} />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(d) => formatServiceDate(String(d))} />} />
        <Bar dataKey="orders" fill="var(--color-orders)" radius={2} />
      </BarChart>
    </ChartContainer>
  );
}

export function OrdersByWindowChart({ data }: { data: { window: string; orders: number }[] }) {
  return (
    <ChartContainer config={windowConfig} className="aspect-auto h-64 w-full">
      <BarChart data={data} layout="vertical" accessibilityLayer margin={{ left: 8 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" tickLine={false} axisLine={false} allowDecimals={false} />
        <YAxis type="category" dataKey="window" tickLine={false} axisLine={false} width={120} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="orders" fill="var(--color-orders)" radius={2} />
      </BarChart>
    </ChartContainer>
  );
}
