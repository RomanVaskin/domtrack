BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS total_price integer;

ALTER TABLE orders
  ADD CONSTRAINT orders_total_price_check
  CHECK (total_price IS NULL OR total_price >= 0);

COMMIT;
