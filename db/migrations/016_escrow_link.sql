-- Which piece each VK storage payment paid for, once a claim has revealed it.
--
-- A storage escrow is private by design: the deposit names a payment commitment
-- and nothing else, and only the vault keeper's claim -- at service end, or on
-- deletion -- reveals the registration behind it, through the claim
-- transaction's own input. The file cycle screens showed that link by fetching
-- every claim the network had ever made and, for each one, reading its
-- transaction and three contract values from the node, on every visit. That is
-- four chain reads per claim per reader, forever growing.
--
-- The indexer now does that work once per claim, as it reads the claim, and
-- keeps the answer here. A screen looks a piece up by its commitment hash, or a
-- payment by its commitment, with one indexed query.

BEGIN;

CREATE TABLE IF NOT EXISTS escrow_link (
  payment_commitment      BYTEA        NOT NULL,
  claim_tx                BYTEA        NOT NULL,
  -- 'claimed' at service end, or 'deletion' when the piece was deleted early.
  kind                    TEXT         NOT NULL,
  claim_block             BIGINT       NOT NULL,
  claim_log               INTEGER      NOT NULL DEFAULT 0,
  recipient               BYTEA,
  -- Null when the claim's input could not be read back to a registration.
  registration_commitment BYTEA,
  commitment_hash         BYTEA,
  vk                      BYTEA,
  -- The escrow as the contract reported it when the claim was read.
  amount                  NUMERIC(78,0),
  service_start           BIGINT,
  service_end             BIGINT,
  depositor               BYTEA,
  PRIMARY KEY (payment_commitment, claim_tx)
);

CREATE INDEX IF NOT EXISTS escrow_link_by_commitment ON escrow_link (commitment_hash);

-- How far through the claim events the links have been worked out. The work is
-- done a bounded number of claims per pass, oldest first, so a long chain fills
-- in over a few passes rather than stalling one.
CREATE TABLE IF NOT EXISTS escrow_link_state (
  id           BOOLEAN     PRIMARY KEY DEFAULT TRUE CHECK (id),
  resolved_to  BIGINT      NOT NULL DEFAULT -1,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migration (version) VALUES ('016_escrow_link')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
