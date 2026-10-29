export const StorageProofSCABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "registeredFreeBytes",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "registeredDataBytes",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "provedFreeBytes",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "provedDataBytes",
        "type": "uint64"
      }
    ],
    "name": "CapacityAccountingUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "totalCapacityBytes",
        "type": "uint64"
      }
    ],
    "name": "CapacityDeclared",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "usedBytes",
        "type": "uint64"
      }
    ],
    "name": "CapacityUsageUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      }
    ],
    "name": "ChallengeOpened",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "fileRegistration",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "required",
        "type": "bool"
      }
    ],
    "name": "FileRegistrationGuardSet",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      }
    ],
    "name": "PartitionChallengeOpened",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "partitionCircuitSectors",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "partitionCircuitChallenges",
        "type": "uint8"
      }
    ],
    "name": "PartitionCircuitParamsUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "contentVersion",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "contentHash",
        "type": "bytes32"
      }
    ],
    "name": "PartitionContentVersionUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "partitionKind",
        "type": "uint8"
      }
    ],
    "name": "PartitionDeactivated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      }
    ],
    "name": "PartitionProofSubmitted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "detSeed",
        "type": "bytes32"
      }
    ],
    "name": "PartitionProofSubmittedDeterministic",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "deadlineIndex",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "partitionIndex",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "partitionKind",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "sectorCount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "committedBytes",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "expiration",
        "type": "uint64"
      }
    ],
    "name": "PartitionRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "partitionKind",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "sectorCount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "committedBytes",
        "type": "uint64"
      }
    ],
    "name": "PartitionUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "partitionVerifier",
        "type": "address"
      }
    ],
    "name": "PartitionVerifierUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "proofPeriodSeconds",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "proofDeadlineSeconds",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "maxChallengeCount",
        "type": "uint16"
      }
    ],
    "name": "ProofPeriodUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "reputationManager",
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
        "internalType": "bytes32",
        "name": "sectorKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      }
    ],
    "name": "SectorProofMissed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      }
    ],
    "name": "SectorProofSubmitted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "expiration",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "sectorBlockCount",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "challengeCount",
        "type": "uint16"
      }
    ],
    "name": "SectorRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      }
    ],
    "name": "SectorStatusChanged",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorKey",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorId",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "oldSectorRoot",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "newSectorRoot",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "expiration",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "sectorBlockCount",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint16",
        "name": "challengeCount",
        "type": "uint16"
      }
    ],
    "name": "SectorUpdated",
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
    "name": "VerifierUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "attempts",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "timestamp",
        "type": "uint64"
      }
    ],
    "name": "WrongProofAttempted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "zkBlockSizeBytes",
        "type": "uint32"
      }
    ],
    "name": "ZkBlockSizeUpdated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "CAPACITY_PARTITION_INDEX_OFFSET",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "PARTITION_KIND_CAPACITY",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "PARTITION_KIND_DATA",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "vk",
        "type": "address"
      }
    ],
    "name": "capacityAccountingOf",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "declaredBytes",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "reportedUsed",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "registeredFree",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "registeredData",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "provedFree",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "provedData",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "registeredWithinDeclared",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "provedWithinDeclared",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "name": "challenges",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "openedAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "openedAtBlock",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "proven",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      }
    ],
    "name": "computePartitionDetSeed",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "currentRound",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "dataLifecycleGuardRequired",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "deadlineIndex",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "partitionIndex",
        "type": "uint8"
      }
    ],
    "name": "deactivatePartition",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "totalCapacityBytes",
        "type": "uint64"
      }
    ],
    "name": "declareCapacity",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "declaredCapacity",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      }
    ],
    "name": "expectedPartitionPublicInputs",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      }
    ],
    "name": "expectedPartitionPublicInputsDeterministic",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sk",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      }
    ],
    "name": "expectedPublicInputs",
    "outputs": [
      {
        "internalType": "uint256[]",
        "name": "",
        "type": "uint256[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "fileRegistration",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      }
    ],
    "name": "getPartitionBlockCounts",
    "outputs": [
      {
        "internalType": "uint32[]",
        "name": "",
        "type": "uint32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      }
    ],
    "name": "getPartitionChallengeAnchor",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "anchor",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "anchorBlock_",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      }
    ],
    "name": "getPartitionPieceCommitments",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      }
    ],
    "name": "getPartitionProofStatus",
    "outputs": [
      {
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      },
      {
        "internalType": "uint64",
        "name": "lastProofRound",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "registeredAt",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      }
    ],
    "name": "getPartitionSectorIds",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      }
    ],
    "name": "getPartitionSectorRoots",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      }
    ],
    "name": "getPartitionVersionStatus",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "contentHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "contentVersion",
        "type": "uint64"
      },
      {
        "internalType": "bytes32",
        "name": "lastProvenContentHash",
        "type": "bytes32"
      },
      {
        "internalType": "bool",
        "name": "currentContentProven",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "vk",
        "type": "address"
      }
    ],
    "name": "getVkPartitionKeys",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "vk",
        "type": "address"
      }
    ],
    "name": "getVkSectorKeys",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "",
        "type": "bytes32[]"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      }
    ],
    "name": "isDetProven",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "lastProofAt",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sk",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      }
    ],
    "name": "markMissed",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "maxChallengeCount",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sectorId",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      }
    ],
    "name": "openChallenge",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      }
    ],
    "name": "openPartitionChallenge",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "name": "partitionChallenges",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "seed",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "openedAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "openedAtBlock",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "proven",
        "type": "bool"
      },
      {
        "internalType": "bytes32",
        "name": "provenContentHash",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "partitionCircuitChallenges",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "partitionCircuitSectors",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "internalType": "uint8",
        "name": "deadlineIndex",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "partitionIndex",
        "type": "uint8"
      }
    ],
    "name": "partitionKeyOf",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "partitionIndex",
        "type": "uint8"
      }
    ],
    "name": "partitionKindOf",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "",
        "type": "uint8"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "partitionVerifier",
    "outputs": [
      {
        "internalType": "contract IStorageProofVerifier",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "partitions",
    "outputs": [
      {
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      },
      {
        "internalType": "uint8",
        "name": "deadlineIndex",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "partitionIndex",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "partitionKind",
        "type": "uint8"
      },
      {
        "internalType": "uint64",
        "name": "committedBytes",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "expiration",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "registeredAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "updatedAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "lastProofRound",
        "type": "uint64"
      },
      {
        "internalType": "uint16",
        "name": "challengeCount",
        "type": "uint16"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      },
      {
        "internalType": "bytes32",
        "name": "contentHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "contentVersion",
        "type": "uint64"
      },
      {
        "internalType": "bytes32",
        "name": "lastProvenContentHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "challengeAnchor",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "anchorBlock",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "proofDeadlineSeconds",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "proofPeriodSeconds",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "provedCapacityFreeBytes",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "provedDataUsedBytes",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "deadlineIndex",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "partitionIndex",
        "type": "uint8"
      },
      {
        "internalType": "bytes32[]",
        "name": "sectorIds",
        "type": "bytes32[]"
      },
      {
        "internalType": "bytes32[]",
        "name": "sectorRoots",
        "type": "bytes32[]"
      },
      {
        "internalType": "uint32[]",
        "name": "sectorBlockCounts",
        "type": "uint32[]"
      },
      {
        "internalType": "bytes32[]",
        "name": "pieceCommitments",
        "type": "bytes32[]"
      },
      {
        "internalType": "uint64",
        "name": "expiration",
        "type": "uint64"
      },
      {
        "internalType": "uint16",
        "name": "challengeCount",
        "type": "uint16"
      }
    ],
    "name": "registerOrUpdatePartition",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sectorId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "expiration",
        "type": "uint64"
      },
      {
        "internalType": "uint32",
        "name": "sectorBlockCount",
        "type": "uint32"
      },
      {
        "internalType": "uint16",
        "name": "challengeCount",
        "type": "uint16"
      }
    ],
    "name": "registerOrUpdateSector",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "sectorKey",
        "type": "bytes32"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "registeredCapacityFreeBytes",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "registeredDataUsedBytes",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "reportedUsedBytes",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "reputationManager",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "rewardManager",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "sectorId",
        "type": "bytes32"
      }
    ],
    "name": "sectorKeyOf",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "sectors",
    "outputs": [
      {
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "sectorId",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "expiration",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "registeredAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "updatedAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "lastProofRound",
        "type": "uint64"
      },
      {
        "internalType": "uint32",
        "name": "sectorBlockCount",
        "type": "uint32"
      },
      {
        "internalType": "uint16",
        "name": "challengeCount",
        "type": "uint16"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "fr",
        "type": "address"
      },
      {
        "internalType": "bool",
        "name": "required",
        "type": "bool"
      }
    ],
    "name": "setFileRegistrationGuard",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint8",
        "name": "sectors_",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "challenges_",
        "type": "uint8"
      }
    ],
    "name": "setPartitionCircuitParams",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "v",
        "type": "address"
      }
    ],
    "name": "setPartitionVerifier",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "period",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "deadline",
        "type": "uint64"
      },
      {
        "internalType": "uint16",
        "name": "maxC",
        "type": "uint16"
      }
    ],
    "name": "setProofPeriod",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "rm",
        "type": "address"
      }
    ],
    "name": "setReputationManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "rm",
        "type": "address"
      }
    ],
    "name": "setRewardManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sectorId",
        "type": "bytes32"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      }
    ],
    "name": "setSectorActive",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "sm",
        "type": "address"
      }
    ],
    "name": "setStakingManager",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "vkr",
        "type": "address"
      }
    ],
    "name": "setVaultKeeperRegistry",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "v",
        "type": "address"
      }
    ],
    "name": "setVerifier",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint16",
        "name": "slashBps",
        "type": "uint16"
      },
      {
        "internalType": "uint16",
        "name": "suspendSlashBps",
        "type": "uint16"
      },
      {
        "internalType": "uint64",
        "name": "suspendSeconds",
        "type": "uint64"
      }
    ],
    "name": "setWrongProofSlashParams",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "repThreshold",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "slashThreshold",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "suspendThreshold",
        "type": "uint32"
      }
    ],
    "name": "setWrongProofThresholds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint32",
        "name": "size_",
        "type": "uint32"
      }
    ],
    "name": "setZkBlockSizeBytes",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "stakingManager",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      },
      {
        "internalType": "bytes",
        "name": "proof",
        "type": "bytes"
      },
      {
        "internalType": "uint256[]",
        "name": "publicInputs",
        "type": "uint256[]"
      }
    ],
    "name": "submitPartitionZkProof",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "pKey",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      },
      {
        "internalType": "bytes",
        "name": "proof",
        "type": "bytes"
      },
      {
        "internalType": "uint256[]",
        "name": "publicInputs",
        "type": "uint256[]"
      }
    ],
    "name": "submitPartitionZkProofDeterministic",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sectorId",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "round",
        "type": "uint64"
      },
      {
        "internalType": "bytes",
        "name": "proof",
        "type": "bytes"
      },
      {
        "internalType": "uint256[]",
        "name": "publicInputs",
        "type": "uint256[]"
      }
    ],
    "name": "submitZkSectorProof",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "usedBytes",
        "type": "uint64"
      }
    ],
    "name": "updateCapacityUsage",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "vaultKeeperRegistry",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "verifier",
    "outputs": [
      {
        "internalType": "contract IStorageProofVerifier",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "name": "wrongProofAttempts",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "wrongProofRepThreshold",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "wrongProofSlashBps",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "wrongProofSlashThreshold",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "wrongProofSuspendSeconds",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "wrongProofSuspendSlashBps",
    "outputs": [
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "wrongProofSuspendThreshold",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "zkBlockSizeBytes",
    "outputs": [
      {
        "internalType": "uint32",
        "name": "",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
