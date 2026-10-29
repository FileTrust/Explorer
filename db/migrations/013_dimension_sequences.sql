-- Hand back the ids the dimension tables spent without using.
--
-- `contract.id` and `event_type.id` are SMALLINT, so their sequences hold 32,767
-- values. Both were written with `INSERT ... ON CONFLICT`, which draws an id for
-- every row it attempts and discards it once the conflict is found -- and the
-- indexer attempts every contract and every event name on every pass. Rows that
-- had not changed since the first run were costing about seventy ids a minute.
--
-- contract_id_seq reached its maximum with thirty-one rows in the table using
-- ids 19 to 49, and from then on every indexer pass ended with `nextval: reached
-- maximum value of sequence`. The store simply stopped advancing while the
-- Explorer went on serving what it already had.
--
-- The insert no longer reaches the sequence for a row that exists, so this only
-- has to undo the damage already done: wind each sequence back to just past the
-- largest id actually in use. Nothing is renumbered, so every `contract_id` and
-- `event_type_id` already recorded against an event still points where it did.
SELECT setval(
  pg_get_serial_sequence('contract', 'id'),
  GREATEST(COALESCE((SELECT max(id) FROM contract), 0), 1)
);

SELECT setval(
  pg_get_serial_sequence('event_type', 'id'),
  GREATEST(COALESCE((SELECT max(id) FROM event_type), 0), 1)
);
