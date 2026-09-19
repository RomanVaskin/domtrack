BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS worker_name text,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS on_the_way_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

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
    'rejected'
  ));

COMMIT;
