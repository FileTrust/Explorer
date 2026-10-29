-- The event log, when ClickHouse is the store for it.
--
-- Same rows as the Postgres `event` table and the same repository interface
-- above it, so which engine answered is invisible to every screen. The split is
-- that Postgres keeps current state -- ten thousand vault keepers, updated in
-- place, read transactionally -- and this keeps the append-only history, which
-- at the measured rate is 4.78 billion rows a year.
--
-- Run against a database created as:
--   CREATE DATABASE IF NOT EXISTS filetrust_explorer;

CREATE TABLE IF NOT EXISTS event
(
  block_number   UInt64,
  log_index      UInt32,
  block_time     DateTime64(3, 'UTC'),
  -- Lowercase hex without the 0x, as String rather than FixedString.
  --
  -- FixedString is the compact choice and was the first one. It cannot be fed
  -- through JSONEachRow: raw bytes have to be carried inside a JSON string, and
  -- every byte above 0x7F becomes two under UTF-8, so a 32-byte hash arrives
  -- longer than 32 bytes and the insert fails with TOO_LARGE_STRING_SIZE.
  -- Hex doubles the length before compression and then largely disappears into
  -- it, which is a cheaper price than an encoding hazard on every write.
  tx_hash        String,
  tx_index       UInt32,
  contract_id    UInt16,
  event_id       UInt16,
  -- Nullable rather than empty-string sentinels: "no subject" and "the zero
  -- address" are different things, and a filter must not conflate them.
  subject_addr   Nullable(String),
  subject_key    Nullable(String),
  args           String  CODEC(ZSTD(3))
)
ENGINE = ReplacingMergeTree
-- Ordered the way the screens read: this contract, this event, newest first.
-- The sort key is also the deduplication key, so re-ingesting a batch after a
-- restart eventually collapses to one row and the indexer needs no rollback
-- logic. Safe to rely on because CometBFT finalises in one block: there are no
-- reorgs to undo, only replays to absorb.
--
-- "Eventually" is the word that matters. Deduplication happens during a
-- background merge at a time nothing can predict, so between a replay and that
-- merge both copies are really there. Every read therefore goes through FINAL --
-- see selectEventsClickHouse. Dropping FINAL to make a query faster would make
-- it quietly wrong instead, which is the worse of the two.
ORDER BY (contract_id, event_id, block_number, log_index)
PARTITION BY toYYYYMM(block_time)
-- Skip indexes for the two "everything about this entity" questions. Both are
-- selective and neither is in the sort key, so without these they are scans.
TTL block_time + INTERVAL 10 YEAR
SETTINGS index_granularity = 8192;

ALTER TABLE event ADD INDEX IF NOT EXISTS event_subject_addr subject_addr TYPE bloom_filter(0.01) GRANULARITY 4;
ALTER TABLE event ADD INDEX IF NOT EXISTS event_subject_key  subject_key  TYPE bloom_filter(0.01) GRANULARITY 4;
ALTER TABLE event ADD INDEX IF NOT EXISTS event_block        block_number TYPE minmax GRANULARITY 1;

-- Dimensions are duplicated here rather than joined across engines. They are
-- eighteen and 147 rows; carrying them twice is cheaper than a cross-store join
-- on every query.
CREATE TABLE IF NOT EXISTS contract
(
  id       UInt16,
  address  FixedString(20),
  name     String,
  label    String
)
ENGINE = ReplacingMergeTree
ORDER BY id;

CREATE TABLE IF NOT EXISTS event_type
(
  id    UInt16,
  name  String
)
ENGINE = ReplacingMergeTree
ORDER BY id;
