-- FTU that contracts paid out inside transactions.
--
-- A transaction records one transfer, the value its sender attached. Rewards
-- from a pool, DKG and PRE fees, escrow refunds and returned stake are all paid
-- by a contract while the transaction runs, so none of them is a transaction of
-- its own. A wallet paid that way had a balance its history could not explain.
--
-- The indexer reads them from the node's call trace (see trace_internal.mjs).
-- Keyed by the transaction and the call's position in it, so a block traced
-- twice -- a retry, an overlap between two passes -- writes nothing new.

BEGIN;

CREATE TABLE IF NOT EXISTS internal_transfer (
  tx_hash       BYTEA         NOT NULL,
  -- The call's position in the transaction's call tree, counted over every
  -- call made, so it does not change with which of them moved value.
  trace_index   INTEGER       NOT NULL,
  block_number  BIGINT        NOT NULL,
  block_time    TIMESTAMPTZ   NOT NULL,
  tx_index      INTEGER       NOT NULL,
  from_addr     BYTEA         NOT NULL,
  to_addr       BYTEA         NOT NULL,
  value_wei     NUMERIC(78,0) NOT NULL,
  -- CALL for an ordinary payment; CREATE, CREATE2 or SELFDESTRUCT otherwise.
  call_type     TEXT          NOT NULL,
  PRIMARY KEY (tx_hash, trace_index)
);

-- One wallet's history, each side an indexed seek in the order the screen
-- shows -- the same shape the transaction table uses, for the same reason.
CREATE INDEX IF NOT EXISTS internal_transfer_by_from
  ON internal_transfer (from_addr, block_number DESC, tx_index DESC, trace_index DESC);
CREATE INDEX IF NOT EXISTS internal_transfer_by_to
  ON internal_transfer (to_addr, block_number DESC, tx_index DESC, trace_index DESC);

-- How far tracing has got, so a screen can say what an empty list means.
--
-- "No payments" and "not checked" look the same in an empty table. The range is
-- the run of blocks traced without a break; a block inside it that could not be
-- traced is listed below rather than breaking the range, and is tried again.
CREATE TABLE IF NOT EXISTS internal_trace_state (
  id           SMALLINT    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- False once the node has said it cannot trace at all.
  supported    BOOLEAN     NOT NULL DEFAULT TRUE,
  -- 'block', 'tx' or 'none': how this node is being asked.
  mode         TEXT,
  traced_from  BIGINT,
  traced_to    BIGINT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS internal_trace_gap (
  block_number BIGINT      PRIMARY KEY,
  reason       TEXT,
  attempts     INTEGER     NOT NULL DEFAULT 1,
  last_tried   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migration (version) VALUES ('014_internal_transfer')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
