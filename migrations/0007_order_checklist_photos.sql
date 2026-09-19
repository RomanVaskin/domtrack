BEGIN;

ALTER TABLE order_photos
  ADD COLUMN checklist_item_id bigint
    REFERENCES order_checklist_items(id) ON DELETE CASCADE;

ALTER TABLE order_photos DROP CONSTRAINT order_photos_kind_check;
ALTER TABLE order_photos
  ADD CONSTRAINT order_photos_kind_check
  CHECK (kind IN ('before', 'after', 'checklist'));

ALTER TABLE order_photos
  ADD CONSTRAINT order_photos_checklist_binding_check
  CHECK (
    (kind = 'checklist' AND checklist_item_id IS NOT NULL)
    OR (kind IN ('before', 'after') AND checklist_item_id IS NULL)
  );

CREATE INDEX order_photos_checklist_item_id_created_at_idx
  ON order_photos (checklist_item_id, created_at, id)
  WHERE checklist_item_id IS NOT NULL;

COMMIT;
