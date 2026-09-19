BEGIN;

CREATE SEQUENCE domtrack_order_number_seq
  AS bigint
  START WITH 1
  MAXVALUE 999999
  NO CYCLE;

CREATE TABLE orders (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  number text NOT NULL UNIQUE DEFAULT
    ('DT-' || lpad(nextval('domtrack_order_number_seq')::text, 6, '0')),
  telegram_chat_id bigint NOT NULL,
  telegram_username text,
  service_type text NOT NULL,
  client_name text NOT NULL,
  client_phone text NOT NULL,
  address text NOT NULL,
  requested_date date NOT NULL,
  requested_time text NOT NULL,
  photo_report_enabled boolean NOT NULL,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  comment text,
  status text NOT NULL DEFAULT 'new' CHECK (status = 'new'),
  source_session_id text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_telegram_chat_id_idx ON orders (telegram_chat_id);
CREATE INDEX orders_created_at_idx ON orders (created_at DESC);

CREATE TABLE telegram_sessions (
  telegram_chat_id bigint PRIMARY KEY,
  session_id text NOT NULL UNIQUE,
  state text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMIT;
