// Generated from the compiled Cosmos recovery-v1 artifact.
export const ZkDkgDisputeManagerRecoveryEventABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "dkg",
        "type": "address"
      }
    ],
    "name": "DkgContractSet",
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
        "internalType": "bool",
        "name": "isRefresh",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "dealer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "dealerIndex",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "encryptedShareHash",
        "type": "bytes32"
      }
    ],
    "name": "ZkDkgBabyJubjubMaterialPublished",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "coordinator",
        "type": "address"
      }
    ],
    "name": "ZkDkgCoordinatorV2Set",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
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
        "internalType": "bool",
        "name": "isRefresh",
        "type": "bool"
      },
      {
        "indexed": false,
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
    "name": "ZkDkgDealerExcluded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "period",
        "type": "uint64"
      }
    ],
    "name": "ZkDkgDisputePeriodSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "disputeId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "dealer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      }
    ],
    "name": "ZkDkgEncryptedShareDisputeExpired",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "disputeId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "dealer",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      }
    ],
    "name": "ZkDkgEncryptedShareDisputeJustified",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "disputeId",
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
        "internalType": "uint32",
        "name": "shareVersion",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "isRefresh",
        "type": "bool"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "receiver",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "dealer",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "receiverIndex",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "dealerIndex",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      }
    ],
    "name": "ZkDkgEncryptedShareDisputeOpened",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint8",
        "name": "participantCount",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "uint8",
        "name": "threshold",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "verifier",
        "type": "address"
      }
    ],
    "name": "ZkDkgShareVerifierForCommitteeSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint8",
        "name": "participantCount",
        "type": "uint8"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "verifier",
        "type": "address"
      }
    ],
    "name": "ZkDkgShareVerifierForParticipantCountSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "verifier",
        "type": "address"
      }
    ],
    "name": "ZkDkgShareVerifierSet",
    "type": "event"
  }
] as const;
