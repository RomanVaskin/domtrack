BEGIN;

CREATE TABLE order_checklist_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  title text NOT NULL,
  position integer NOT NULL CHECK (position > 0),
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamptz,
  CONSTRAINT order_checklist_items_order_position_key UNIQUE (order_id, position),
  CONSTRAINT order_checklist_items_completion_check CHECK (
    (completed AND completed_at IS NOT NULL)
    OR (NOT completed AND completed_at IS NULL)
  )
);

CREATE INDEX order_checklist_items_order_id_idx
  ON order_checklist_items (order_id);

COMMIT;
