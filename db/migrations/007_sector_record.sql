-- Sectors as rows, the same shape as partitions.
--
-- The sector screen counts active sectors by replaying registrations and status
-- changes, which is the same set difference the partition counts were, and has
-- the same answer: resolve it on the contract and store the boolean.
--
-- This chain currently has no sectors, so the non-zero path is unexercised here.
-- It is written the same way partitions are, which have 129 rows verified field
-- by field against the chain, so what is untested is the data rather than the
-- shape.

BEGIN;

CREATE TABLE IF NOT EXISTS sector_record (
  address           BYTEA        PRIMARY KEY,   -- the sectorKey
  vk                BYTEA        NOT NULL,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  sector_blocks     BIGINT       NOT NULL DEFAULT 0,
  challenge_count   INTEGER      NOT NULL DEFAULT 0,
  profile           JSONB,
  synced_block      BIGINT       NOT NULL DEFAULT 0,
  last_event_block  BIGINT       NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sector_by_vk     ON sector_record (vk, active);
CREATE INDEX IF NOT EXISTS sector_by_active ON sector_record (active);

INSERT INTO schema_migration (version) VALUES ('007_sector_record')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
