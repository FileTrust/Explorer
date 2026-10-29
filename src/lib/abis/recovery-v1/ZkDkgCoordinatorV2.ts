// Generated from the compiled Cosmos recovery-v1 artifact.
export const ZkDkgCoordinatorV2RecoveryEventABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "materialId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "fileId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "epoch",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "version",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "outcome",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "faults",
        "type": "uint8"
      }
    ],
    "name": "AttemptClosed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "controller",
        "type": "address"
      }
    ],
    "name": "AttemptControllerSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "disputeManager",
        "type": "address"
      }
    ],
    "name": "DisputeManagerSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "duration",
        "type": "uint64"
      }
    ],
    "name": "DkgKeyGenDeadlineSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "materialId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "fileId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "keyEpoch",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "nonParticipantCount",
        "type": "uint8"
      }
    ],
    "name": "DkgKeyGenExpired",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "guardianShareProof",
        "type": "address"
      }
    ],
    "name": "GuardianShareProofSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "reward",
        "type": "address"
      }
    ],
    "name": "GuardianWorkRewardSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "maxInactivitySeconds",
        "type": "uint256"
      }
    ],
    "name": "MaxInactivitySecondsSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "materialId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "fileId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "epoch",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "version",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "contributors",
        "type": "uint32"
      }
    ],
    "name": "RefreshMaterialsReady",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "manager",
        "type": "address"
      }
    ],
    "name": "ReputationManagerSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "manager",
        "type": "address"
      }
    ],
    "name": "RewardManagerSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "manager",
        "type": "address"
      }
    ],
    "name": "StakingManagerSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "materialId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "fileId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "keyEpoch",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "shareVersion",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "dealerIndex",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "dealer",
        "type": "address"
      }
    ],
    "name": "V2DealerCommitmentsPublished",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "materialId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "fileId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "keyEpoch",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "shareVersion",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "fromIndex",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "toIndex",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "dealer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      }
    ],
    "name": "V2EncryptedSharePublished",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "materialId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "fileId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "keyEpoch",
        "type": "uint32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "shareVersion",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "absentCount",
        "type": "uint8"
      }
    ],
    "name": "V2RefreshAbsentPenalized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "materialId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "fileId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "keyEpoch",
        "type": "uint32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "shareVersion",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "absentCount",
        "type": "uint8"
      }
    ],
    "name": "V2RefreshExpired",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "materialId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "fileId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "keyEpoch",
        "type": "uint32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "dealer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "dealerIndex",
        "type": "uint8"
      }
    ],
    "name": "ZkDkgV2DealerMaterialAccepted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "materialId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "fileId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "dataOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "keyEpoch",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "shareVersion",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "t",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "n",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "publicKeyX",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "publicKeyY",
        "type": "uint256"
      }
    ],
    "name": "ZkDkgV2Finalized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "materialId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "fileId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "keyEpoch",
        "type": "uint32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "shareVersion",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "newT",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "newN",
        "type": "uint8"
      }
    ],
    "name": "ZkDkgV2SamePkRefreshFinalized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "materialId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "fileId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "keyEpoch",
        "type": "uint32"
      },
      {
        "indexed": true,
        "internalType": "uint32",
        "name": "shareVersion",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "oldShareVersion",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "oldT",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "oldN",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "newT",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "newN",
        "type": "uint8"
      }
    ],
    "name": "ZkDkgV2SamePkRefreshRequested",
    "type": "event"
  }
] as const;
