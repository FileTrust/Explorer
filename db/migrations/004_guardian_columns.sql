-- Columns the guardian list sorts by, matching the spec's `columns`.
-- The projection lifts these out of the profile JSON so a page can be filtered
-- and ordered without reading it.

BEGIN;

ALTER TABLE guardian ADD COLUMN IF NOT EXISTS completed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE guardian ADD COLUMN IF NOT EXISTS failed    INTEGER NOT NULL DEFAULT 0;

INSERT INTO schema_migration (version) VALUES ('004_guardian_columns')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
