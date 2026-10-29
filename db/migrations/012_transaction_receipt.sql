-- What a receipt says, so the transaction page never has to ask the chain.
--
-- The Explorer's whole shape is "the indexer reads the chain, everything else
-- reads the indexer", and the transaction page was the one screen still going
-- straight to the node for its main answer. It worked, and it is fast on a local
-- node, but it puts every reader's page load on the RPC endpoint the network
-- itself depends on -- which is exactly what the rest of this was built to stop.
--
-- The transaction row already carried everything the chain says about the *call*.
-- These two are what the chain says about its *result*, and without them the
-- page could not be served from the store at all.
--
-- Nullable, deliberately. Transactions indexed before this migration have no
-- receipt recorded, and a nullable column tells the page to ask the node for
-- that one rather than showing a confident zero.

ALTER TABLE transaction ADD COLUMN IF NOT EXISTS status   SMALLINT;
ALTER TABLE transaction ADD COLUMN IF NOT EXISTS gas_used BIGINT;

INSERT INTO schema_migration (version) VALUES ('012_transaction_receipt')
  ON CONFLICT (version) DO NOTHING;
