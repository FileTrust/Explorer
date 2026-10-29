import { ZkDkgDisputeManagerRecoveryEventABI } from './recovery-v1/ZkDkgDisputeManager';
const LegacyZkDkgDisputeManagerABI = [
  { type: 'event', name: 'ZkDkgEncryptedShareDisputeOpened', anonymous: false, inputs: [
    { indexed: true, name: 'disputeId', type: 'bytes32' },
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: true, name: 'keyEpoch', type: 'uint32' },
    { indexed: false, name: 'shareVersion', type: 'uint32' },
    { indexed: false, name: 'isRefresh', type: 'bool' },
    { indexed: false, name: 'receiver', type: 'address' },
    { indexed: false, name: 'dealer', type: 'address' },
    { indexed: false, name: 'receiverIndex', type: 'uint8' },
    { indexed: false, name: 'dealerIndex', type: 'uint8' },
    { indexed: false, name: 'deadline', type: 'uint64' },
  ]},
  { type: 'event', name: 'ZkDkgEncryptedShareDisputeJustified', anonymous: false, inputs: [
    { indexed: true, name: 'disputeId', type: 'bytes32' },
    { indexed: true, name: 'dealer', type: 'address' },
    { indexed: true, name: 'receiver', type: 'address' },
  ]},
  { type: 'event', name: 'ZkDkgEncryptedShareDisputeExpired', anonymous: false, inputs: [
    { indexed: true, name: 'disputeId', type: 'bytes32' },
    { indexed: true, name: 'dealer', type: 'address' },
    { indexed: true, name: 'receiver', type: 'address' },
  ]},
  { type: 'event', name: 'ZkDkgDealerExcluded', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: true, name: 'keyEpoch', type: 'uint32' },
    { indexed: true, name: 'shareVersion', type: 'uint32' },
    { indexed: false, name: 'isRefresh', type: 'bool' },
    { indexed: false, name: 'dealer', type: 'address' },
    { indexed: false, name: 'dealerIndex', type: 'uint8' },
  ]},
] as const;
export const ZkDkgDisputeManagerABI = [...LegacyZkDkgDisputeManagerABI,...ZkDkgDisputeManagerRecoveryEventABI] as const;
