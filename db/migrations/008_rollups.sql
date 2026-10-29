-- Rollup tables: one row per participant and per file, summed from the log.
--
-- Amounts are NUMERIC rather than BIGINT because they are wei: a single reward
-- fits in 64 bits, and a protocol's lifetime total does not. Rounding a balance
-- into a double to make it fit is the failure this whole schema is written to
-- avoid, so the sums stay exact all the way to the screen, where they are read
-- as decimal strings.

CREATE TABLE IF NOT EXISTS economic_participant (
  address          BYTEA        PRIMARY KEY,
  rewards          NUMERIC(78,0) NOT NULL DEFAULT 0,
  claimed          NUMERIC(78,0) NOT NULL DEFAULT 0,
  pool_deposits    NUMERIC(78,0) NOT NULL DEFAULT 0,
  stake_deposits   NUMERIC(78,0) NOT NULL DEFAULT 0,
  slashed          NUMERIC(78,0) NOT NULL DEFAULT 0,
  escrow_paid      NUMERIC(78,0) NOT NULL DEFAULT 0,
  escrow_received  NUMERIC(78,0) NOT NULL DEFAULT 0,
  event_count      INTEGER      NOT NULL DEFAULT 0,
  synced_block     BIGINT       NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- The table is read newest-activity-first in the UI but paged by key, so the
-- primary key is the cursor. This index serves the "who earned most" ordering.
CREATE INDEX IF NOT EXISTS participant_by_rewards ON economic_participant (rewards DESC);

CREATE TABLE IF NOT EXISTS file_economics (
  file_id                 BYTEA        PRIMARY KEY,
  policy_escrow_deposited NUMERIC(78,0) NOT NULL DEFAULT 0,
  policy_escrow_refunded  NUMERIC(78,0) NOT NULL DEFAULT 0,
  access_escrow_deposited NUMERIC(78,0) NOT NULL DEFAULT 0,
  rewards_credited        NUMERIC(78,0) NOT NULL DEFAULT 0,
  access_request_count    INTEGER      NOT NULL DEFAULT 0,
  event_count             INTEGER      NOT NULL DEFAULT 0,
  synced_block            BIGINT       NOT NULL DEFAULT 0,
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS file_economics_by_escrow
  ON file_economics (access_escrow_deposited DESC);

INSERT INTO schema_migration (version) VALUES ('008_rollups')
  ON CONFLICT (version) DO NOTHING;
