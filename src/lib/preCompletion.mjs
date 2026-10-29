/**
 * When is a V2 access request (PRE) finished?
 *
 * There is no event that says so. Every event TElGv2 emits is a step, not a
 * verdict: V2AccessPartialSubmitted, PreReadyDeclared, PreBadPartialDetected,
 * PreRequestExpired. The dashboard used to count DataVault's
 * ReencryptedCidsStored, which fires only from storeReencryptedCids -- the
 * LEGACY TElG path. req_actions.py says it outright:
 *
 *     reusableRequestPlusOneByKey is only set by Legacy TElG
 *     (storeReencryptedCids), never by V2
 *
 * So on a V2 network that count is 0 forever, and "PRE Waiting", computed as
 * requests minus completed minus expired, showed every finished request as
 * waiting. Observed 2026-10-06: 11 requests, 0 completed, 11 waiting, while
 * getV2PartialGuardians showed 3 or 4 partials on every one of the 21 requests
 * the chain held -- all of them complete.
 *
 * Completion therefore has to be derived, and the cryptography already says how:
 * a request is fulfilled once accepted partials reach its file's Guardian
 * threshold, because that is the point at which the requester can reconstruct.
 */

/**
 * Count the requests whose partials reached their file's threshold.
 *
 * @param {Map<string, number>} partialsByRequest requestId -> accepted partials
 * @param {Map<string, string>} fileByRequest     requestId -> fileId (lowercased)
 * @param {Map<string, number>} thresholdByFile   fileId (lowercased) -> threshold
 * @returns {{ completed: number, requests: number, unknownPolicy: number }}
 */
export function countRequestsAtThreshold(partialsByRequest, fileByRequest, thresholdByFile) {
  let completed = 0;
  let unknownPolicy = 0;
  for (const [requestId, fileId] of fileByRequest) {
    const threshold = Number(thresholdByFile.get(fileId) ?? 0);
    if (!(threshold > 0)) {
      // A threshold of zero is an unreadable policy, not a satisfied one.
      // Treating it as satisfied would be the same mistake in the other
      // direction: every request complete the moment a policy went missing.
      unknownPolicy += 1;
      continue;
    }
    if (Number(partialsByRequest.get(requestId) ?? 0) >= threshold) completed += 1;
  }
  return { completed, requests: fileByRequest.size, unknownPolicy };
}
