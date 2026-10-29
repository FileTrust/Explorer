-- Promote the fields the deadlines screen groups by.
--
-- A deadline is not an entity anywhere: it is what you get by grouping the
-- partitions of one vault keeper by their deadline index. The screen built that
-- grouping in the browser, from a replay of fifteen event streams, because the
-- projected partition rows kept these five fields only inside the profile JSON.
-- As columns they are one GROUP BY, and `partition_by_deadline (deadline, vk)`
-- already exists to serve it.
--
-- `deadline` holds the deadline *index*, which is what the contract calls it and
-- what the screen displays as "DL0". It is not a timestamp; `expiration` is.

ALTER TABLE partition_record ADD COLUMN IF NOT EXISTS sector_count BIGINT NOT NULL DEFAULT 0;

-- Backfill from the profile the rows already carry, so promoting a column does
-- not mean waiting for the next full projection to answer with it. The values
-- are the same ones the projector writes; this only moves them out of the JSON.
UPDATE partition_record SET
  deadline     = coalesce((profile ->> 'deadlineIndex')::bigint, deadline),
  sector_count = coalesce((profile ->> 'sectorCount')::bigint, sector_count),
  proofs       = coalesce((profile ->> 'submittedProofs')::int, proofs),
  challenges   = coalesce((profile ->> 'openedChallenges')::int, challenges),
  expiration   = CASE
                   WHEN coalesce((profile ->> 'expiration')::bigint, 0) > 0
                   THEN to_timestamp((profile ->> 'expiration')::bigint)
                   ELSE expiration
                 END
WHERE profile IS NOT NULL;

INSERT INTO schema_migration (version) VALUES ('009_partition_deadline_columns')
  ON CONFLICT (version) DO NOTHING;
