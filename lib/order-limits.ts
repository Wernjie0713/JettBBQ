// Cart limits, shared by the browser cart and the checkout action. place_order (SQL, latest copy in
// supabase/migrations/20261109000000_review_fixes.sql) checks the same numbers and can't import
// this file: change both together.

export const MAX_QTY_PER_ITEM = 50;
export const MAX_CART_LINES = 30;
