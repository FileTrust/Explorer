export const FileRegistrationSCABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "bytes32", "name": "commitmentHash", "type": "bytes32" },
      { "indexed": true, "internalType": "address", "name": "vkAddress", "type": "address" },
      { "indexed": false, "internalType": "uint64", "name": "serviceEnd", "type": "uint64" }
    ],
    "name": "FileStorageServiceEndExtended",
    "type": "event"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "commitmentHash", "type": "bytes32" },
      { "internalType": "uint64", "name": "newServiceEnd", "type": "uint64" }
    ],
    "name": "extendServiceEnd",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "bytes32", "name": "registrationCommitment", "type": "bytes32" }
    ],
    "name": "registrationServiceEnd",
    "outputs": [{ "internalType": "uint64", "name": "", "type": "uint64" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "oldValue",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "newValue",
        "type": "uint64"
      }
    ],
    "name": "DeletionGraceSecondsUpdated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vkAddress",
        "type": "address"
      }
    ],
    "name": "FileDeletionAuthorized",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vkAddress",
        "type": "address"
      }
    ],
    "name": "FileDeletionConfirmed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vkAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "graceSeconds",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "declaredAt",
        "type": "uint64"
      }
    ],
    "name": "FileDeletionDeclared",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vkAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "oldDeadlineIndex",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "oldPartitionIndex",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "newDeadlineIndex",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "newPartitionIndex",
        "type": "uint8"
      }
    ],
    "name": "FileStoragePartitionMigrated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vkAddress",
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
        "internalType": "uint64",
        "name": "serviceEnd",
        "type": "uint64"
      }
    ],
    "name": "FileStorageRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      }
    ],
    "name": "PartitionLinked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "vkAddress",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "oldDeadlineIndex",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "oldPartitionIndex",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "newDeadlineIndex",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "newPartitionIndex",
        "type": "uint8"
      }
    ],
    "name": "PartitionMigrationConfirmed",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "storageProofSC",
        "type": "address"
      }
    ],
    "name": "assessSectorRisk",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "commitmentHash",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "vkAddress",
            "type": "address"
          },
          {
            "internalType": "bool",
            "name": "partitionLinked",
            "type": "bool"
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
            "internalType": "bool",
            "name": "partitionActive",
            "type": "bool"
          },
          {
            "internalType": "uint64",
            "name": "lastProofRound",
            "type": "uint64"
          }
        ],
        "internalType": "struct FileRegistrationSC.CommitmentRiskEntry[]",
        "name": "entries",
        "type": "tuple[]"
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
      },
      {
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "pieceCommitment",
        "type": "bytes32"
      }
    ],
    "name": "canReleaseDataSlot",
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
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "commitmentHashToRegistrationCommitment",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "confirmFileDeletion",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "deletionGraceSeconds",
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
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "deletionRecords",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "declaredAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "graceSeconds",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "confirmedAt",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "confirmed",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "authorized",
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
      }
    ],
    "name": "fileRecords",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "zkPieceCommitment",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "vkAddress",
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
      },
      {
        "internalType": "uint64",
        "name": "serviceEnd",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "registeredAt",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "partitionLinked",
        "type": "bool"
      },
      {
        "internalType": "bytes32",
        "name": "deletionAuthHash",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "getCommitmentLifecycle",
    "outputs": [
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "deletionDeclared",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "deletionConfirmed",
        "type": "bool"
      },
      {
        "internalType": "uint64",
        "name": "deletionDeclaredAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "deletionConfirmedAt",
        "type": "uint64"
      },
      {
        "internalType": "bytes32",
        "name": "registrationCommitment",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      }
    ],
    "name": "getCommitmentsForSector",
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
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "internalType": "uint256",
        "name": "offset",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "limit",
        "type": "uint256"
      }
    ],
    "name": "getCommitmentsForSector",
    "outputs": [
      {
        "internalType": "bytes32[]",
        "name": "page",
        "type": "bytes32[]"
      },
      {
        "internalType": "uint256",
        "name": "total",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "getDeletionConfirmedAt",
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
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "getDeletionRecord",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "declaredAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "graceSeconds",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "confirmed",
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
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "getDeletionRecordV2",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "declaredAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "graceSeconds",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "confirmedAt",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "confirmed",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "authorized",
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
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "getFileRecordForDeletion",
    "outputs": [
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
      },
      {
        "internalType": "bytes32",
        "name": "zkPieceCommitment",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "getRecord",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "sectorRoot",
            "type": "bytes32"
          },
          {
            "internalType": "bytes32",
            "name": "zkPieceCommitment",
            "type": "bytes32"
          },
          {
            "internalType": "address",
            "name": "vkAddress",
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
          },
          {
            "internalType": "uint64",
            "name": "serviceEnd",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "registeredAt",
            "type": "uint64"
          },
          {
            "internalType": "bool",
            "name": "partitionLinked",
            "type": "bool"
          },
          {
            "internalType": "bytes32",
            "name": "deletionAuthHash",
            "type": "bytes32"
          }
        ],
        "internalType": "struct FileRegistrationSC.FileStorageRecord",
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "isDeletionAuthorized",
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
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "isDeletionConfirmed",
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
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "isDeletionDeclared",
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
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "migrationDeclared",
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
        "name": "vkAddress",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "internalType": "uint8",
        "name": "oldDeadlineIndex",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "oldPartitionIndex",
        "type": "uint8"
      }
    ],
    "name": "migrationKey",
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
      }
    ],
    "name": "pendingMigrations",
    "outputs": [
      {
        "internalType": "uint8",
        "name": "oldDeadlineIndex",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "oldPartitionIndex",
        "type": "uint8"
      },
      {
        "internalType": "bool",
        "name": "pending",
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
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "recordExists",
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
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "registerFileDeletion",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "deletionAuthSecret",
        "type": "bytes32"
      }
    ],
    "name": "registerFileDeletionAuthorized",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "zkPieceCommitment",
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
        "internalType": "uint64",
        "name": "serviceEnd",
        "type": "uint64"
      },
      {
        "internalType": "bytes32",
        "name": "registrationCommitment",
        "type": "bytes32"
      }
    ],
    "name": "registerFileStorage",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "zkPieceCommitment",
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
        "internalType": "uint64",
        "name": "serviceEnd",
        "type": "uint64"
      },
      {
        "internalType": "bytes32",
        "name": "registrationCommitment",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "deletionAuthHash",
        "type": "bytes32"
      }
    ],
    "name": "registerFileStorageV2",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "registrationCommitment",
        "type": "bytes32"
      }
    ],
    "name": "registrationCommitmentExists",
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
        "internalType": "bytes32",
        "name": "registrationCommitment",
        "type": "bytes32"
      }
    ],
    "name": "registrationCommitmentIsActive",
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
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "name": "registrationCommitmentToCommitmentHash",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      }
    ],
    "name": "sectorActiveCommitmentCounts",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "active",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "total",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "sectorRoot",
        "type": "bytes32"
      }
    ],
    "name": "sectorCommitmentCount",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
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
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "sectorRootToCommitments",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "newGrace",
        "type": "uint64"
      }
    ],
    "name": "setDeletionGraceSeconds",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "_vkr",
        "type": "address"
      }
    ],
    "name": "setVaultKeeperRegistry",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "trustedStorageProofSC",
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
        "name": "commitmentHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint8",
        "name": "newDeadlineIndex",
        "type": "uint8"
      },
      {
        "internalType": "uint8",
        "name": "newPartitionIndex",
        "type": "uint8"
      }
    ],
    "name": "updateFileStoragePartition",
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
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "commitmentHash",
        "type": "bytes32"
      }
    ],
    "name": "verifyPartitionContainsSector",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
