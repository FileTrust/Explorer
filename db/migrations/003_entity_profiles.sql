-- Current state as rows, so the entity screens stop making a chain of calls.
--
-- A vault keeper's profile is 29 fields assembled from ten contract reads. Ten
-- keepers cost 118 requests that way; batching through Multicall3 made that 8,
-- but the cost still follows the number of keepers, so ten thousand of them is
-- a hundred thousand reads per page load, per reader, however they are packed.
--
-- As a row it is one query returning a page, and it stops mattering how many
-- keepers there are.
--
-- The typed columns are the ones screens filter and sort by, so they are indexed
-- and kept honest. The whole profile goes in `profile` beside them, because it
-- is read from the contracts as a unit and pinning all 29 fields into columns
-- would mean a migration every time a contract grows one. Numbers are stored as
-- digits, the same convention the event arguments use, so the client revives
-- them the same way.

BEGIN;

ALTER TABLE vault_keeper ADD COLUMN IF NOT EXISTS profile JSONB;
ALTER TABLE guardian     ADD COLUMN IF NOT EXISTS profile JSONB;

-- When the row was last reconciled against the chain, and at which block. A row
-- that is merely old is not wrong -- nothing changed -- but a row that has not
-- been refreshed since an event touched its subject is, and this is what makes
-- that difference visible instead of guessed at.
ALTER TABLE vault_keeper ADD COLUMN IF NOT EXISTS synced_block BIGINT NOT NULL DEFAULT 0;
ALTER TABLE guardian     ADD COLUMN IF NOT EXISTS synced_block BIGINT NOT NULL DEFAULT 0;

-- Entities whose state an event has changed but which have not been re-read yet.
-- The indexer drains this rather than re-reading every entity on every pass:
-- the work then follows what actually changed, not how large the network is,
-- which is the whole point of the table.
CREATE TABLE IF NOT EXISTS entity_dirty (
  kind         TEXT   NOT NULL,          -- 'vault_keeper' | 'guardian'
  id           BYTEA  NOT NULL,          -- the address
  since_block  BIGINT NOT NULL,
  PRIMARY KEY (kind, id)
);

CREATE INDEX IF NOT EXISTS entity_dirty_kind ON entity_dirty (kind, since_block);

INSERT INTO schema_migration (version) VALUES ('003_entity_profiles')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
