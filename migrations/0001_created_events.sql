CREATE TABLE IF NOT EXISTS created_events (
  id TEXT PRIMARY KEY,
  source_draft_id TEXT NOT NULL UNIQUE,
  organisation_id TEXT NOT NULL,
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  venue TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK (capacity > 0),
  created_at TEXT NOT NULL,
  created_by_id TEXT NOT NULL,
  created_by_display_name TEXT NOT NULL,
  created_by_channel TEXT NOT NULL CHECK (created_by_channel IN ('human-ui', 'webmcp')),
  is_synthetic INTEGER NOT NULL DEFAULT 1 CHECK (is_synthetic = 1)
);

CREATE INDEX IF NOT EXISTS created_events_start_time
  ON created_events (starts_at, id);

CREATE INDEX IF NOT EXISTS created_events_organisation
  ON created_events (organisation_id, starts_at);
