import { ZkDkgCoordinatorV2RecoveryEventABI } from './recovery-v1/ZkDkgCoordinatorV2';
const LegacyZkDkgCoordinatorV2ABI = [
  { type: 'event', name: 'DkgKeyGenExpired', anonymous: false, inputs: [
    { indexed: true,  name: 'fileId',             type: 'bytes32' },
    { indexed: true,  name: 'keyEpoch',           type: 'uint32'  },
    { indexed: false, name: 'nonParticipantCount', type: 'uint8'   },
  ]},
  { type: 'event', name: 'V2RefreshExpired', anonymous: false, inputs: [
    { indexed: true,  name: 'fileId',        type: 'bytes32' },
    { indexed: true,  name: 'keyEpoch',      type: 'uint32'  },
    { indexed: true,  name: 'shareVersion',  type: 'uint32'  },
    { indexed: false, name: 'absentCount',   type: 'uint8'   },
  ]},
  { type: 'event', name: 'ZkDkgV2DealerMaterialAccepted', anonymous: false, inputs: [
    { indexed: true,  name: 'fileId',       type: 'bytes32' },
    { indexed: true,  name: 'keyEpoch',     type: 'uint32'  },
    { indexed: true,  name: 'dealer',       type: 'address' },
    { indexed: false, name: 'dealerIndex',  type: 'uint8'   },
  ]},
  { type: 'event', name: 'ZkDkgV2Finalized', anonymous: false, inputs: [
    { indexed: true,  name: 'fileId',       type: 'bytes32'  },
    { indexed: true,  name: 'dataOwner',    type: 'address'  },
    { indexed: true,  name: 'keyEpoch',     type: 'uint32'   },
    { indexed: false, name: 'shareVersion', type: 'uint32'   },
    { indexed: false, name: 't',            type: 'uint8'    },
    { indexed: false, name: 'n',            type: 'uint8'    },
    { indexed: false, name: 'publicKeyX',   type: 'uint256'  },
    { indexed: false, name: 'publicKeyY',   type: 'uint256'  },
  ]},
  { type: 'event', name: 'ZkDkgV2SamePkRefreshFinalized', anonymous: false, inputs: [
    { indexed: true,  name: 'fileId',       type: 'bytes32' },
    { indexed: true,  name: 'keyEpoch',     type: 'uint32'  },
    { indexed: true,  name: 'shareVersion', type: 'uint32'  },
    { indexed: false, name: 'newT',         type: 'uint8'   },
    { indexed: false, name: 'newN',         type: 'uint8'   },
  ]},
  { type: 'event', name: 'ZkDkgV2SamePkRefreshRequested', anonymous: false, inputs: [
    { indexed: true,  name: 'fileId',          type: 'bytes32' },
    { indexed: true,  name: 'keyEpoch',        type: 'uint32'  },
    { indexed: true,  name: 'shareVersion',    type: 'uint32'  },
    { indexed: false, name: 'oldShareVersion', type: 'uint32'  },
    { indexed: false, name: 'oldT',            type: 'uint8'   },
    { indexed: false, name: 'oldN',            type: 'uint8'   },
    { indexed: false, name: 'newT',            type: 'uint8'   },
    { indexed: false, name: 'newN',            type: 'uint8'   },
  ]},
  { type: 'event', name: 'DkgKeyGenDeadlineSet', anonymous: false, inputs: [
    { indexed: false, name: 'duration', type: 'uint64' },
  ]},
] as const;
export const ZkDkgCoordinatorV2ABI = [...LegacyZkDkgCoordinatorV2ABI,...ZkDkgCoordinatorV2RecoveryEventABI] as const;
