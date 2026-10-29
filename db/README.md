# PostgreSQL and ClickHouse setup

The normal `install.sh` path installs both local stores and applies the SQL
schemas. It uses PostgreSQL binaries supplied by the operating system and a
checksum-verified, pinned ClickHouse download. It does not redistribute a
database binary or existing data in this repository.

## What each store holds

- PostgreSQL: current protocol entities, counters, checkpoints and indexed state.
- ClickHouse: the append-oriented event log and event queries.

The default database name in each is `filetrust_explorer`. Both listen on
loopback. The data directory and ports can be selected using the environment
settings documented in the root README. Every installation needs its own data
directory and unused ports.

## SQL schemas

`db/migrations/*.sql` are applied in filename order and recorded in PostgreSQL's
`schema_migration` table. Applied versions are skipped on later runs; the
idempotent dimension-sequence repair script is also safe to rerun.
`db/clickhouse/001_init.sql` defines the ClickHouse event tables with idempotent
creation statements. Apply the schema through the normal migration command:

```sh
npm run db:migrate
```

Do not run migrations as the public web reader. The installer gives that reader
SELECT-only access and bounded query resources. It saves separate owner settings
for migrations and indexing in `.env.local`, and web-reader settings in `.env.web`.
Passwords are generated locally and are never repository defaults.

## Restart, reinstall and reset

```sh
python3 explorer_stores.py --keep-index
```

This starts missing local stores, applies missing migrations and verifies reader
provisioning. It keeps indexed history. Reinstalling Explorer also keeps history
unless explicitly given `--fresh`.

`python3 explorer_stores.py --fresh` deliberately clears the indexed history
after setup. Use it only for a reviewed reset. Back up your own database through
the database's normal backup tools before an intentional migration or reset;
never add those backups to the source repository.

External databases need equivalent schema, ownership and reader privileges.
Configure their connection settings locally. The managed local-cluster
authentication changes are restricted to the installer-owned data directory.
