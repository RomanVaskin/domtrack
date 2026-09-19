BEGIN;

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS client_token text,
  ADD COLUMN IF NOT EXISTS worker_token text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS orders_client_token_key
  ON orders (client_token);

CREATE UNIQUE INDEX IF NOT EXISTS orders_worker_token_key
  ON orders (worker_token);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('new', 'confirmed', 'rejected'));

COMMIT;
