#!/usr/bin/env node
/// Check every projected row still says what the chain says.
///
/// The entity tables exist so screens stop reading the chain per entity, which
/// means the rows are now the answer and nothing on a page would notice if they
/// drifted. Reading a field off the wrong struct returns zero rather than
/// failing, so drift shows up as a blank column, not an error -- which is how two
/// vault keeper fields were briefly wrong and only a side-by-side caught it.
///
/// So: for every spec, read the stored rows straight from the contracts again
/// and compare field by field. It uses the same `readEntities` the projection
/// uses, so it checks the stored result rather than re-implementing the mapping
/// it is supposed to be checking.
///
///   npm run verify:projection
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http } from 'viem';

const here = path.dirname(fileURLToPath(import.meta.url));
const explorerRoot = path.resolve(here, '..');
if (existsSync(path.join(explorerRoot, '.env.local'))) {
  process.loadEnvFile(path.join(explorerRoot, '.env.local'));
}

const { db, closeDb, toHex } = await import('../src/lib/db/postgres.mjs');
const { ENTITY_SPECS } = await import('./entity_specs.mjs');
const { contractsNeeded, loadAbis, readEntities } = await import('./project_entities.mjs');

const client = createPublicClient({
  transport: http(process.env.RPC_URL || 'http://127.0.0.1:8545'),
});

/// Timestamps of the "seconds since epoch" kind move on their own between the
/// projection and this check; comparing them would report the clock as drift.
const LIVE_FIELDS = new Set(['lastHeartbeat', 'lastActivityAt']);

/// Fields counted from the event log rather than read from a contract.
///
/// This check reads the chain and compares. A tallied field has no chain value
/// to compare against -- asking the contract how many proofs a partition has
/// submitted is not a question it answers -- so including them reported all 61
/// partitions with proofs as drifted. They are checked by the counts on screen
/// matching the aggregate, which is a different test in a different place.
const TALLIED = new Set(['submittedProofs', 'openedChallenges']);

/// Fields whose value is the event's, not the contract's.
///
/// Same reason as TALLIED, arrived at from the other direction. A partition's
/// sector count is announced in the event that registered it and is held nowhere
/// on the contract; the block it was registered in is that event's own block.
/// Reading the chain for either returns zero, so comparing against it reported
/// every partition as drifted -- 258 fields of false alarm on a projection that
/// was right.
///
/// They are checked where they can be: `verify_rollups.mjs` proves the column
/// shapes that produce them, and the screens' totals are compared against the
/// aggregate endpoint.
const FROM_EVENTS = new Set(['sectorCount', 'firstBlock']);

function normalise(value) {
  if (typeof value === 'bigint') return value.toString();
  if (value === null || value === undefined) return '';
  return String(value);
}

async function main() {
  const deployed = JSON.parse(await readFile(process.env.DEPLOYED_ADDRESSES_PATH, 'utf8'));
  const addresses = deployed.contracts ?? deployed;
  const abis = await loadAbis(process.env.EXPLORER_BLOCKCHAIN_ROOT || path.join(explorerRoot, '.network'), contractsNeeded());

  const wired = {};
  for (const name of Object.keys(abis)) {
    if (addresses[name]) wired[name] = { address: addresses[name], abi: abis[name] };
  }

  let totalChecked = 0;
  let totalDrifted = 0;
  let missingFields = 0;

  for (const spec of ENTITY_SPECS) {
    const { rows } = await db().query(`SELECT address, profile FROM ${spec.table}`);
    if (rows.length === 0) {
      console.log(`  ${spec.kind}: no rows projected`);
      continue;
    }

    // Does the row carry every field the screen declares it will read?
    //
    // A projection that quietly drops one does not produce a smaller answer; it
    // produces a screen that throws on the field it expected. The guardian spec
    // dropped seven and the page went blank with nothing in the console -- the
    // server was answering 200 the whole time.
    if (spec.profileType) {
      const src = await readFile(path.join(explorerRoot, spec.profileType.file), 'utf8');
      const block = src.match(
        new RegExp(`export interface ${spec.profileType.name}\\s*\\{([\\s\\S]*?)\\n\\}`),
      );
      if (block) {
        const declared = [...block[1].matchAll(/^\s*([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((m) => m[1]);
        const sample = rows[0].profile ?? {};
        const absent = declared.filter((f) => !(f in sample));
        if (absent.length > 0) {
          missingFields += absent.length;
          console.log(`    ${spec.kind}: ${spec.profileType.name} declares ${absent.join(', ')}, the projection does not produce them`);
        }
      }
    }

    // Which field the map calls the key. Vault keepers and guardians call it
    // `address`; a file policy calls it `fileId`. The table column is `address`
    // either way, so only the comparison needs to know.
    const keyField = spec.keyField ?? 'address';
    const stored = new Map(rows.map((r) => [toHex(r.address).toLowerCase(), r.profile]));
    const live = await readEntities(client, spec, wired, [...stored.keys()]);

    let checked = 0;
    let drifted = 0;
    const fields = new Set();

    for (const chain of live) {
      if (!chain) continue;
      const row = stored.get(String(chain[keyField]).toLowerCase());
      if (!row) { drifted++; continue; }
      for (const [field, chainValue] of Object.entries(chain)) {
        if (LIVE_FIELDS.has(field) || TALLIED.has(field) || FROM_EVENTS.has(field)) continue;
        checked++;
        if (normalise(chainValue) !== normalise(row[field])) {
          drifted++;
          fields.add(field);
          if (drifted <= 3) {
            console.log(`    ${chain[keyField]} ${field}: chain=${normalise(chainValue)} row=${normalise(row[field])}`);
          }
        }
      }
    }

    totalChecked += checked;
    totalDrifted += drifted;
    console.log(
      `  ${spec.kind}: ${stored.size} rows, ${checked} fields` +
      (drifted === 0 ? ' — match' : ` — ${drifted} differ (${[...fields].join(', ')})`),
    );
  }

  console.log(`\n${totalChecked} fields compared across ${ENTITY_SPECS.length} entity types`);
  if (totalDrifted === 0 && missingFields === 0) {
    console.log('PROJECTION MATCHES THE CHAIN, AND IS COMPLETE');
  } else {
    if (totalDrifted) console.log(`${totalDrifted} values differ from the chain`);
    if (missingFields) console.log(`${missingFields} fields the screens read are not produced`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => { console.error(error.message ?? error); process.exitCode = 1; })
  .finally(() => closeDb());
