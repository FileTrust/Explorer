-- PRE re-encryption requests, rolled up from the log.
--
-- The screen showing these merged five event streams and could not be paged the
-- way the others were. The rule the other joins rely on is "later news about an
-- earlier thing": a deletion follows a registration, a fulfilment follows a
-- request, so bounding the join at the oldest loaded row cannot miss anything.
-- That rule does not hold here. A request can appear in an expiry without ever
-- having had a readiness declaration, so no one stream is reliably first, and a
-- window bounded below by the oldest loaded row would cut off earlier events
-- belonging to a row on the page.
--
-- It is also not a sum, so the economics rollup did not fit either: a row
-- carries *sets* of guardian addresses. Hence a third shape -- distinct
-- collection, keyed by a number rather than a hash.
--
-- request_id is TEXT because it is a uint256. Most are small; nothing in the
-- contract says they must be, and a silently truncated identifier is the kind
-- of bug that looks like a missing row.

CREATE TABLE IF NOT EXISTS pre_request (
  request_id       TEXT        PRIMARY KEY,
  file_id          BYTEA,
  -- Lowercase hex addresses, as JSON arrays. A set per row rather than a join
  -- table: they are read together, always, and never queried across rows.
  ready_guardians  JSONB       NOT NULL DEFAULT '[]'::jsonb,
  active_guardians JSONB       NOT NULL DEFAULT '[]'::jsonb,
  bad_guardians    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  tx_hashes        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  expired          BOOLEAN     NOT NULL DEFAULT FALSE,
  absent_count     INTEGER     NOT NULL DEFAULT 0,
  -- The earliest block any of the five events touched this request, which is
  -- what the screen orders by and calls the request's block.
  first_block      BIGINT      NOT NULL DEFAULT 0,
  event_count      INTEGER     NOT NULL DEFAULT 0,
  synced_block     BIGINT      NOT NULL DEFAULT 0,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pre_request_by_block ON pre_request (first_block DESC);

INSERT INTO schema_migration (version) VALUES ('010_pre_request')
  ON CONFLICT (version) DO NOTHING;
