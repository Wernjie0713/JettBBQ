-- Customers use address line 2 for delivery instructions too (longest in the Dec 2025 data: 252 chars).
alter table public.orders drop constraint orders_address_line2_check;
alter table public.orders
  add constraint orders_address_line2_check check (char_length(address_line2) <= 300);
