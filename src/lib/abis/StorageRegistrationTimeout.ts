import { parseAbi } from 'viem';

export const StorageRegistrationTimeoutABI = parseAbi([
  'function resolveRegistrationTimeout(address vk, bytes32 paymentCommitment, bytes32 registrationCommitment, uint256 quotedPriceWei, uint64 quoteValidUntil, bytes quoteSignature)',
  'function resolvedTimeouts(bytes32 timeoutId) view returns (bool)',
  'event RegistrationTimeoutResolved(bytes32 indexed timeoutId, address indexed vk, bytes32 indexed paymentCommitment, bytes32 registrationCommitment, bytes32 commitmentHash, bool registeredLate, address doAddress)',
]);
