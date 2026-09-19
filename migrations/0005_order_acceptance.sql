BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN (
    'new',
    'confirmed',
    'assigned',
    'on_the_way',
    'in_progress',
    'completed',
    'accepted',
    'rejected'
  ));

COMMIT;
