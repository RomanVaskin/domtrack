BEGIN;

CREATE TABLE order_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('before', 'after')),
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_photos_order_id_created_at_idx
  ON order_photos (order_id, created_at, id);

COMMIT;
