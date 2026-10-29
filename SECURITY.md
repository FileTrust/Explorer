# Explorer security

The Explorer is a read-only public application. It does not need wallet seeds,
private keys, validator identities or transaction-signing credentials.

## Private settings

The installer generates `.env.local` for the owner/indexer and `.env.web` for
the web reader. Both are private, mode `0600`, and ignored by Git. Reader
accounts use different passwords from owners and are restricted to SELECT.
Database files, authentication configuration and backups must remain private.

The system-wide web service uses a separate dynamic identity, bounded resources
and a read-only app mount, with owner settings and backup directories hidden.
Manual runs and user services share the operator's OS identity and therefore
do not provide the same filesystem isolation.

Managed databases listen on loopback. Provisioning configures PostgreSQL SCRAM
authentication and ClickHouse password hashes, verifies fresh reader
connections, and applies query, memory and concurrency limits. Check successful
provisioning before exposing the web app. Default installers are not a substitute
for your own deployment and capacity review.

## Public request handling

The RPC proxy permits reviewed read methods and rejects signing, account
management, transaction submission, arbitrary tracers and state overrides.
Requests, responses, batches, log ranges, trace concurrency and database queries
have bounds. The app also applies CSP nonces and security response headers.

Keep the database administrator and indexer configuration out of the web
identity. Keep upstream endpoints and credentials server-side; do not put them
in `NEXT_PUBLIC_*` variables. Operate your own TLS and edge protection as needed.
No private reverse-proxy or infrastructure configuration is included here.

The locked dependency tree has published advisories in transitive tooling
dependencies. A passing build or secret scan is not a production security audit.
Review dependency updates and deployment behavior before a production release.

## Reporting a vulnerability

Use GitHub private vulnerability reporting if available. Otherwise contact
support@filetrust.io to arrange a private report. Do not post credentials,
operational logs, private settings or unpatched exploit details in public issues.
