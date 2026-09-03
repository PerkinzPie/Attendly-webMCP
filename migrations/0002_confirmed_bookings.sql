CREATE TABLE IF NOT EXISTS confirmed_bookings (
  id TEXT PRIMARY KEY,
  booking_reference TEXT NOT NULL UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE,
  event_id TEXT NOT NULL,
  organisation_id TEXT NOT NULL,
  guardian_name TEXT NOT NULL,
  guardian_email TEXT NOT NULL,
  adult_tickets INTEGER NOT NULL CHECK (adult_tickets >= 0),
  child_tickets INTEGER NOT NULL CHECK (child_tickets >= 0),
  confirmed_at TEXT NOT NULL,
  confirmed_via TEXT NOT NULL CHECK (confirmed_via IN ('human-ui', 'webmcp')),
  is_synthetic INTEGER NOT NULL DEFAULT 1 CHECK (is_synthetic = 1),
  CHECK (adult_tickets + child_tickets BETWEEN 1 AND 6)
);

CREATE INDEX IF NOT EXISTS confirmed_bookings_event
  ON confirmed_bookings (event_id, confirmed_at, id);
