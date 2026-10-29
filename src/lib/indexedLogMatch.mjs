/// Matching indexed events against the filters a chain query would have applied.
///
/// Separated out, and deliberately free of imports, so it can be exercised
/// directly. The risk in reading events from an index rather than the chain is
/// not speed but silence: a filter that is accepted and then ignored returns
/// every event of a type instead of the few that were asked for, and looks from
/// the outside exactly like it is working.

/// Compare one value the way the chain would. Addresses and hashes differ only
/// in case, and numbers come back as strings once they have been through JSON.
export function sameValue(actual, wanted) {
  if (actual === undefined || actual === null) return false;
  if (typeof wanted === 'bigint' || typeof actual === 'bigint') {
    try {
      return BigInt(actual) === BigInt(wanted);
    } catch {
      return false;
    }
  }
  return String(actual).toLowerCase() === String(wanted).toLowerCase();
}

/// Every named argument must match. A missing argument never matches, or a
/// query about one file would answer with events belonging to all of them.
/// An array means "any of these", which is how the chain reads it. An undefined
/// value means the caller left that filter unset and is not a filter at all.
export function matchesArgs(args, wanted) {
  if (!wanted) return true;
  return Object.entries(wanted).every(([key, value]) => {
    if (value === undefined) return true;
    if (Array.isArray(value)) return value.some((v) => sameValue(args[key], v));
    return sameValue(args[key], value);
  });
}

/// Earliest block a fallback query may ask for. Bounded on purpose: an
/// unbounded range is refused outright by a chain that caps log ranges, which is
/// the failure this whole change removes.
export function windowStart(head, size) {
  return head > size ? head - size : 0n;
}

/// Undo the indexer writing every bigint as a decimal string.
///
/// JSON has no bigint, so the indexer stores one as its digits. Handing those
/// back as strings is what a screen adding `0n + amount` reads as "Cannot mix
/// BigInt and other types", and the whole screen throws on its first sum. The
/// chain path returns real bigints, so only the indexed path was ever wrong,
/// which is why this broke a screen at a time rather than obviously.
///
/// Only bare decimal digits are converted. Addresses, hashes and bytes are 0x
/// hex and do not match, and the indexer writes nothing but a bigint as digits.
export function reviveBigInts(value) {
  if (typeof value === 'string') return /^\d+$/.test(value) ? BigInt(value) : value;
  if (Array.isArray(value)) return value.map(reviveBigInts);
  return value;
}

/// Every argument of one indexed event, with the bigints put back.
export function reviveArgs(args) {
  if (!args) return {};
  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [key, reviveBigInts(value)]),
  );
}

/// Argument names that say who or what an event is about.
///
/// The indexer copies these out of the JSON into their own indexed columns, and
/// a query filtering on one of them is answered by that index instead of by
/// fetching a page and discarding most of it. Both sides read this list, because
/// they must agree exactly: a name the indexer did not promote cannot be matched
/// on the column, and asking anyway would return nothing rather than everything
/// -- silently, which is the failure worth designing against.
///
/// Deliberately not "any argument holding an address". Config events name the
/// contracts they point at -- registry, storageProof, capacityProof -- and those
/// are not subjects; treating them as such would file an event under the address
/// of a contract rather than of whoever it concerns.
export const SUBJECT_ADDRESS_ARGS = [
  'vk', 'vkAddress', 'vaultKeeper', 'guardian', 'dealer',
  'payer', 'requester', 'owner', 'dataOwner', 'recipient',
  'depositor', 'account', 'reporter', 'submitter',
];

export const SUBJECT_KEY_ARGS = [
  'fileId', 'partitionKey', 'sectorKey', 'commitment', 'commitmentHash',
  'pieceCommitment', 'registrationCommitment', 'sectorRoot',
  // Last, so it only names events that had no subject before: the VK storage
  // escrow's, which name a payment and nothing else. A file's cycle follows its
  // payments by this key instead of reading every escrow ever made.
  'paymentCommitment',
];

/// Whoever and whatever one event is about, picked exactly as the store picks
/// them for its subject columns: the first argument in each list that holds a
/// value of the right size. Lower case, or null. The file index answers a
/// `subject` filter with this, so it agrees with the store row for row.
export function subjectsOf(args) {
  const pick = (names, pattern) => {
    for (const name of names) {
      const value = args?.[name];
      if (typeof value === 'string' && pattern.test(value)) return value.toLowerCase();
    }
    return null;
  };
  return {
    address: pick(SUBJECT_ADDRESS_ARGS, /^0x[0-9a-fA-F]{40}$/),
    key: pick(SUBJECT_KEY_ARGS, /^0x[0-9a-fA-F]{64}$/),
  };
}

/// The one filter in `args` that can be pushed down to an indexed column, if any.
/// Returns null when nothing matches, so the caller filters in memory as before
/// rather than asking the store a question it cannot answer correctly.
export function subjectFromArgs(args) {
  if (!args) return null;
  for (const name of SUBJECT_ADDRESS_ARGS) {
    const value = args[name];
    if (typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value)) return value;
  }
  for (const name of SUBJECT_KEY_ARGS) {
    const value = args[name];
    if (typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)) return value;
  }
  return null;
}
