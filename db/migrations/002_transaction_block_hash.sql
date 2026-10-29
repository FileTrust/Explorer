-- The transaction list's row shape carries blockHash, so the store has to hold
-- it or the repository would be inventing a field the type says is always there.
-- Nothing reads it from the index today -- the two places that use a block hash
-- ask the chain directly -- but a store that answers with a shape different from
-- the one it promises is a trap laid for whoever reads it next.

BEGIN;

ALTER TABLE transaction ADD COLUMN IF NOT EXISTS block_hash BYTEA;

INSERT INTO schema_migration (version) VALUES ('002_transaction_block_hash')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
