-- Additive only: live AIS tables are unaffected. Every document is synthetic.
CREATE TABLE IF NOT EXISTS operating_scenarios (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK (revision > 0),
  document JSONB NOT NULL CHECK (document->>'synthetic' = 'true'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
