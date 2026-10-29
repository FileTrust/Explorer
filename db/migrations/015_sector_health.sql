-- What the storage screen needs to judge a sector's health, as columns.
--
-- The storage screen shows how many sectors are expired, faulted (an active
-- sector that missed a proof) and expiring within a week. It worked that out by
-- replaying every sector event in the browser. The projected rows had the
-- expiration only inside the profile JSON, and no proof tallies at all -- so the
-- sector list read "0 submitted, 0 missed" for every sector once a store was
-- configured. The projection now counts proofs per sector from the log, the way
-- it already does for partitions, and these columns let one grouped count answer
-- the screen.

BEGIN;

ALTER TABLE sector_record ADD COLUMN IF NOT EXISTS expiration       TIMESTAMPTZ;
ALTER TABLE sector_record ADD COLUMN IF NOT EXISTS submitted_proofs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sector_record ADD COLUMN IF NOT EXISTS missed_proofs    INTEGER NOT NULL DEFAULT 0;

-- The expiration is already in every profile, so it is moved out now rather than
-- waiting for each row's next refresh.
UPDATE sector_record SET
  expiration = CASE
                 WHEN coalesce((profile ->> 'expiration')::bigint, 0) > 0
                 THEN to_timestamp((profile ->> 'expiration')::bigint)
                 ELSE NULL
               END
WHERE profile IS NOT NULL;

-- The tallies are not: they come from the log, which only the projection reads.
-- Marking every sector for a re-read makes the next index pass fill them in,
-- instead of leaving them at zero until the slow rotation reaches each row.
INSERT INTO entity_dirty (kind, id, since_block)
SELECT 'sector_record', address, 0 FROM sector_record
ON CONFLICT (kind, id) DO NOTHING;

INSERT INTO schema_migration (version) VALUES ('015_sector_health')
  ON CONFLICT (version) DO NOTHING;

COMMIT;
