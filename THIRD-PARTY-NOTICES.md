# Third-party software

FileTrust-owned Explorer source uses FSL-1.1-ALv2 in `LICENSE`. Dependency code
retains its own license, copyright and attribution notices; it is not relicensed
under FileTrust's terms.

The npm manifest and lockfile identify the exact application and build inputs,
including Next.js, React, TanStack Query, Viem, Recharts, Lucide, node-postgres,
the ClickHouse JavaScript client, TypeScript and the CSS/build tooling. Their
upstream license files are installed with the packages. Preserve applicable
notices when distributing builds containing their code.

PostgreSQL is installed from the operating system's packages. The helper
downloads ClickHouse separately from its official package host and verifies
the pinned archive checksum. No database binary, existing database, credentials
or private configuration is redistributed in this source repository. Those
database products retain their own upstream terms.

The FileTrust logo identifies the project. The source license does not grant
additional trademark rights.
