-- What the block screens show beside the gas: the base fee and the size.
--
-- The block page and the block list now show what a block explorer shows for a
-- block: its base fee, its size, its fees and the contract payments inside it.
-- The fees are summed from the block's transactions, which are already indexed
-- by block; the payments are read by block too, and need an index of their own.

BEGIN;

ALTER TABLE block ADD COLUMN IF NOT EXISTS base_fee_per_gas NUMERIC(78,0);
ALTER TABLE block ADD COLUMN IF NOT EXISTS size             INTEGER;

-- The contract payments of one block, in transaction order.
CREATE INDEX IF NOT EXISTS internal_transfer_by_block
  ON internal_transfer (block_number, tx_index, trace_index);

INSERT INTO schema_migration (version) VALUES ('017_block_details')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
