BEGIN;

CREATE TABLE referral_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text UNIQUE NOT NULL,
  access_token text UNIQUE NOT NULL,
  commission_percent integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders
  ADD COLUMN referral_partner_id uuid REFERENCES referral_partners(id) ON DELETE SET NULL,
  ADD COLUMN referral_source text;

CREATE INDEX orders_referral_partner_id_idx ON orders (referral_partner_id);

COMMIT;
