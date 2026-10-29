-- Partitions as rows.
--
-- The storage screens count "118 active, 88 data, 30 capacity, 11 inactive" by
-- replaying registration and deactivation events and resolving each partition's
-- final state in the browser. That is a set difference, not a count, so no
-- aggregate over the event log can answer it -- and a capped fetch answers it
-- wrongly rather than partially.
--
-- The state comes from the contract, as it does for keepers and guardians. What
-- stays event-derived is the activity in the table beside the counts: proofs
-- submitted, challenges opened, which block it was registered in.

BEGIN;

ALTER TABLE partition_record ADD COLUMN IF NOT EXISTS profile      JSONB;
ALTER TABLE partition_record ADD COLUMN IF NOT EXISTS synced_block BIGINT NOT NULL DEFAULT 0;

-- The framework keys every entity table on `address`; for a partition that
-- column holds its 32-byte key. bytea does not mind, and one key column means
-- one engine rather than one per shape.
ALTER TABLE partition_record RENAME COLUMN partition_key TO address;

CREATE INDEX IF NOT EXISTS partition_by_kind ON partition_record (active, kind);

INSERT INTO schema_migration (version) VALUES ('006_partition_record')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
