-- File policies as rows.
--
-- The access-policy screen listed every file id and then made four reads against
-- each, so its cost followed the number of files -- the one entity here that
-- grows without any bound at all.
--
-- Keyed by fileId, which is 32 bytes rather than an address. bytea holds either,
-- so the projection framework needed only to stop assuming twenty.

BEGIN;

CREATE TABLE IF NOT EXISTS file_policy (
  address           BYTEA        PRIMARY KEY,   -- the fileId; named for the framework
  active            BOOLEAN      NOT NULL DEFAULT FALSE,
  data_owner        BYTEA,
  threshold         INTEGER      NOT NULL DEFAULT 0,
  mode              SMALLINT     NOT NULL DEFAULT 0,
  requester_count   INTEGER      NOT NULL DEFAULT 0,
  key_gen_requested BOOLEAN      NOT NULL DEFAULT FALSE,
  profile           JSONB,
  synced_block      BIGINT       NOT NULL DEFAULT 0,
  last_event_block  BIGINT       NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS file_policy_active ON file_policy (active, address);
CREATE INDEX IF NOT EXISTS file_policy_owner  ON file_policy (data_owner);

INSERT INTO schema_migration (version) VALUES ('005_file_policy')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
