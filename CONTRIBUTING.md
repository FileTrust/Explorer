# Contributing

Use focused pull requests with a clear explanation and validation. Preserve
existing notices and the applicable license for each component. Use signed,
conventional commits.

Install the lockfile and run a production build before submitting runtime
changes. Run `python3 scripts/check_publication.py` before committing. Database
changes need ordered SQL migrations and an explicit compatibility review;
never include a database snapshot as a substitute for schema source.

This minimal distribution omits internal test campaigns, scale benchmarks and
deployment-specific operations. Do not add credentials, runtime environments,
generated address inventories, transaction snapshots, logs or backups.
