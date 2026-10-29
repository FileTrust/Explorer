-- Where each rollup has counted up to.
--
-- This lived in a `synced_block` column on the rollup rows themselves, and that
-- was wrong in a way a test caught immediately: an incremental pass only touches
-- the rows whose keys appeared in the new blocks, so every untouched row keeps
-- the old block. The table minimum therefore never advances, and the next pass
-- adds the same window to the same rows again. Totals double, quietly.
--
-- The watermark belongs to the rollup, not to its rows. One row per spec, read
-- and written inside the same transaction as the merge, which is what makes the
-- additive columns exactly-once: a second run of the same pass sees the moved
-- watermark and computes an empty window.

CREATE TABLE IF NOT EXISTS rollup_state (
  kind         TEXT        PRIMARY KEY,
  synced_block BIGINT      NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Anything already built was built by a full recompute, so it is correct up to
-- whatever block its rows recorded. Seed from that rather than from zero, which
-- would make the first pass after this migration a needless rebuild.
INSERT INTO rollup_state (kind, synced_block)
SELECT 'economic_participant', coalesce(min(synced_block), 0) FROM economic_participant
  ON CONFLICT (kind) DO NOTHING;
INSERT INTO rollup_state (kind, synced_block)
SELECT 'file_economics', coalesce(min(synced_block), 0) FROM file_economics
  ON CONFLICT (kind) DO NOTHING;
INSERT INTO rollup_state (kind, synced_block)
SELECT 'pre_request', coalesce(min(synced_block), 0) FROM pre_request
  ON CONFLICT (kind) DO NOTHING;

INSERT INTO schema_migration (version) VALUES ('011_rollup_state')
  ON CONFLICT (version) DO NOTHING;
