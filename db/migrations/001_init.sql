-- Explorer store: entities, counters, checkpoint, and the event log.
--
-- The index this replaces was JSON on disk, read with JSON.parse. V8 will not
-- build a string longer than 536 MB, so at the measured 1,062 bytes an event
-- that format stopped being readable at roughly half a million events -- not
-- slowly, but not at all. The network is aimed at billions a year.
--
-- Three choices carry most of the size difference before any compression:
-- addresses and hashes are bytea rather than hex text, contract and event names
-- are dimension keys rather than strings repeated on every row, and the
-- arguments screens actually filter by are promoted out of the JSON into
-- indexed columns.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migration (
  version     TEXT PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Dimensions. Eighteen contracts and 147 event types, against billions of rows.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contract (
  id       SMALLSERIAL PRIMARY KEY,
  address  BYTEA       NOT NULL UNIQUE,
  name     TEXT        NOT NULL,
  label    TEXT
);

CREATE TABLE IF NOT EXISTS event_type (
  id    SMALLSERIAL PRIMARY KEY,
  name  TEXT        NOT NULL UNIQUE
);

-- ---------------------------------------------------------------------------
-- The event log.
--
-- Range partitioned on block_number: append-only, always written at the head,
-- and old partitions can be detached to cold storage without touching the live
-- table. BRIN suits that shape almost perfectly -- an index a few pages wide
-- for a table of any size, because physical order and block order agree.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS event (
  block_number  BIGINT      NOT NULL,
  log_index     INTEGER     NOT NULL,
  block_time    TIMESTAMPTZ NOT NULL,
  tx_hash       BYTEA       NOT NULL,
  tx_index      INTEGER     NOT NULL,
  contract_id   SMALLINT    NOT NULL REFERENCES contract(id),
  event_id      SMALLINT    NOT NULL REFERENCES event_type(id),
  -- Whoever the event is about: vk, guardian, payer, requester.
  subject_addr  BYTEA,
  -- Whatever it is about: fileId, partitionKey, commitment.
  subject_key   BYTEA,
  args          JSONB       NOT NULL,
  PRIMARY KEY (block_number, log_index)
) PARTITION BY RANGE (block_number);

-- (block_number, log_index) as the key is what makes ingest idempotent. A
-- restart re-inserting a batch is a no-op through ON CONFLICT DO NOTHING, which
-- is what lets the indexer rely on CometBFT's single-block finality and carry no
-- rollback logic at all.

CREATE INDEX IF NOT EXISTS event_block_brin
  ON event USING brin (block_number) WITH (pages_per_range = 128);

-- The shape every screen asks in: this contract, this event, newest first.
CREATE INDEX IF NOT EXISTS event_by_type
  ON event (contract_id, event_id, block_number DESC, log_index DESC);

-- "Everything this vault keeper did" must be an index scan, not a JSONB search.
CREATE INDEX IF NOT EXISTS event_by_subject_addr
  ON event (subject_addr, block_number DESC) WHERE subject_addr IS NOT NULL;

CREATE INDEX IF NOT EXISTS event_by_subject_key
  ON event (subject_key, block_number DESC) WHERE subject_key IS NOT NULL;

-- Partitions are made on demand rather than guessed at up front, so the chain
-- can outgrow any range that would have been picked here.
CREATE OR REPLACE FUNCTION ensure_event_partition(p_block BIGINT, p_span BIGINT DEFAULT 10000000)
RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE
  v_from BIGINT := (p_block / p_span) * p_span;
  v_to   BIGINT := ((p_block / p_span) + 1) * p_span;
  v_name TEXT   := format('event_p%s', v_from / p_span);
BEGIN
  IF to_regclass(v_name) IS NULL THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF event FOR VALUES FROM (%s) TO (%s)',
      v_name, v_from, v_to
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Blocks and transactions, for the activity lists.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS block (
  number             BIGINT      PRIMARY KEY,
  hash               BYTEA       NOT NULL,
  parent_hash        BYTEA       NOT NULL,
  block_time         TIMESTAMPTZ NOT NULL,
  miner              BYTEA       NOT NULL,
  gas_used           BIGINT      NOT NULL,
  gas_limit          BIGINT      NOT NULL,
  transaction_count  INTEGER     NOT NULL
);

CREATE INDEX IF NOT EXISTS block_by_time ON block (block_time DESC);

CREATE TABLE IF NOT EXISTS transaction (
  hash          BYTEA       PRIMARY KEY,
  block_number  BIGINT      NOT NULL,
  -- Carried here rather than joined from block: transactions are retained far
  -- deeper than blocks, so most outlive the block they came from, and the list
  -- showed a dash where the time should be for every one of them.
  block_time    TIMESTAMPTZ NOT NULL,
  tx_index      INTEGER     NOT NULL,
  from_addr     BYTEA       NOT NULL,
  to_addr       BYTEA,
  value_wei     NUMERIC(78,0) NOT NULL,
  gas           BIGINT      NOT NULL,
  gas_price     NUMERIC(78,0),
  input         BYTEA       NOT NULL
);

CREATE INDEX IF NOT EXISTS transaction_by_block ON transaction (block_number DESC, tx_index DESC);
CREATE INDEX IF NOT EXISTS transaction_by_from  ON transaction (from_addr, block_number DESC);
CREATE INDEX IF NOT EXISTS transaction_by_to    ON transaction (to_addr, block_number DESC)
  WHERE to_addr IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Current state.
--
-- These are what stop the entity screens making a chain of RPC calls. Ten vault
-- keepers cost 118 requests read a field at a time; ten thousand would cost
-- around a hundred and twenty thousand, per page load, per reader. As rows they
-- are one query returning a page.
--
-- numeric(78,0) holds any uint256.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS vault_keeper (
  address              BYTEA        PRIMARY KEY,
  status               SMALLINT     NOT NULL DEFAULT 0,
  active               BOOLEAN      NOT NULL DEFAULT FALSE,
  stake                NUMERIC(78,0) NOT NULL DEFAULT 0,
  available_stake      NUMERIC(78,0) NOT NULL DEFAULT 0,
  locked_stake         NUMERIC(78,0) NOT NULL DEFAULT 0,
  reputation           INTEGER      NOT NULL DEFAULT 0,
  storage_fee          BIGINT       NOT NULL DEFAULT 0,
  capacity_bytes       BIGINT       NOT NULL DEFAULT 0,
  admission_open       BOOLEAN      NOT NULL DEFAULT FALSE,
  reported_free_bytes  BIGINT,
  service_end          TIMESTAMPTZ,
  endpoint             TEXT,
  missed_proofs        INTEGER      NOT NULL DEFAULT 0,
  disputes             INTEGER      NOT NULL DEFAULT 0,
  last_event_block     BIGINT       NOT NULL DEFAULT 0,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vault_keeper_active ON vault_keeper (active, reputation DESC);

CREATE TABLE IF NOT EXISTS guardian (
  address           BYTEA        PRIMARY KEY,
  status            SMALLINT     NOT NULL DEFAULT 0,
  active            BOOLEAN      NOT NULL DEFAULT FALSE,
  stake             NUMERIC(78,0) NOT NULL DEFAULT 0,
  reputation        INTEGER      NOT NULL DEFAULT 0,
  completed         INTEGER      NOT NULL DEFAULT 0,
  failed            INTEGER      NOT NULL DEFAULT 0,
  disputes          INTEGER      NOT NULL DEFAULT 0,
  last_event_block  BIGINT       NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS guardian_active ON guardian (active, reputation DESC);

CREATE TABLE IF NOT EXISTS partition_record (
  partition_key     BYTEA        PRIMARY KEY,
  vk                BYTEA        NOT NULL,
  kind              SMALLINT     NOT NULL,
  active            BOOLEAN      NOT NULL DEFAULT TRUE,
  deadline          BIGINT,
  registered_bytes  BIGINT       NOT NULL DEFAULT 0,
  content_version   BIGINT       NOT NULL DEFAULT 0,
  proofs            INTEGER      NOT NULL DEFAULT 0,
  challenges        INTEGER      NOT NULL DEFAULT 0,
  expiration        TIMESTAMPTZ,
  last_event_block  BIGINT       NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partition_by_vk       ON partition_record (vk, active);
CREATE INDEX IF NOT EXISTS partition_by_deadline ON partition_record (deadline, vk);

CREATE TABLE IF NOT EXISTS file_piece (
  commitment        BYTEA        PRIMARY KEY,
  owner_addr        BYTEA,
  vk                BYTEA,
  size_bytes        BIGINT       NOT NULL DEFAULT 0,
  status            SMALLINT     NOT NULL DEFAULT 0,
  registered_block  BIGINT       NOT NULL DEFAULT 0,
  deleted_block     BIGINT,
  last_event_block  BIGINT       NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS file_piece_by_owner ON file_piece (owner_addr, registered_block DESC);
CREATE INDEX IF NOT EXISTS file_piece_by_vk    ON file_piece (vk, status);

-- ---------------------------------------------------------------------------
-- Totals, and where the indexer got to.
-- ---------------------------------------------------------------------------

-- Counted as events arrive. The dashboard must never run count(*) over the log:
-- at a billion rows that is a table scan to render a number.
CREATE TABLE IF NOT EXISTS counter (
  name        TEXT        PRIMARY KEY,
  value       BIGINT      NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS indexer_checkpoint (
  id               SMALLINT    PRIMARY KEY DEFAULT 1,
  chain_id         BIGINT      NOT NULL,
  -- Hash of the deployed addresses this store was built against. An index built
  -- for another deployment matches nothing and reads as an empty chain rather
  -- than as an error, which is exactly how a misconfigured indexer once cost a
  -- chain's worth of history without anything appearing to be wrong.
  deployment_hash  BYTEA       NOT NULL,
  last_block       BIGINT      NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT indexer_checkpoint_single_row CHECK (id = 1)
);

INSERT INTO schema_migration (version) VALUES ('001_init')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
