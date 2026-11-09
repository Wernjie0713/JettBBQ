-- Imported Dec 2025 orders: the export repeated ", Singapore <postal>" at the end of address line 1
-- and filled an empty line 2 with "0", "00", "-" or ".", so the driver page, order detail and
-- tracking page printed the postcode twice. scripts/seed.ts now cleans these on import; this fixes
-- the rows already loaded.
update public.orders
set address_line1 = regexp_replace(address_line1, ',?\s*Singapore\s+' || postal_code || '\s*$', '', 'i')
where source = 'import'
  and address_line1 ~* (',?\s*Singapore\s+' || postal_code || '\s*$')
  and regexp_replace(address_line1, ',?\s*Singapore\s+' || postal_code || '\s*$', '', 'i') <> '';

update public.orders
set address_line2 = null
where source = 'import'
  and address_line2 !~ '[1-9A-Za-z]';
