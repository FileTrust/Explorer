// Auto-generated from Blockchain/artifacts (functions + events). Read-only Explorer ABI.
export const CapacityIncrementalBatchSCABI = [
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
        "internalType": "enum CapacityIncrementalBatchSC.CampaignKind",
        "name": "kind",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "authorityId",
        "type": "uint64"
      }
    ],
    "name": "CapacityCampaignClaimed",
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
        "internalType": "enum CapacityIncrementalBatchSC.CampaignKind",
        "name": "kind",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "authorityId",
        "type": "uint64"
      }
    ],
    "name": "CapacityCampaignReleased",
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
        "indexed": true,
        "internalType": "uint64",
        "name": "authorityId",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "mode",
        "type": "uint8"
      }
    ],
    "name": "FullSweepCampaignClaimed",
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
        "indexed": true,
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "reason",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "acceptedPartitions",
        "type": "uint32"
      }
    ],
    "name": "IncrementalBatchAbandoned",
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
        "indexed": true,
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "acceptedPartitions",
        "type": "uint32"
      }
    ],
    "name": "IncrementalBatchAborted",
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
        "indexed": true,
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "acceptedPartitions",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "acceptedBytes",
        "type": "uint64"
      }
    ],
    "name": "IncrementalBatchCompleted",
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
        "indexed": true,
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "targetRound",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "cutoffNonce",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint32",
        "name": "selectedPartitions",
        "type": "uint32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "selectedBytes",
        "type": "uint64"
      }
    ],
    "name": "IncrementalBatchOpened",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "identityHash",
        "type": "bytes32"
      }
    ],
    "name": "IncrementalMemberAccepted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
      },
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "identityHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "committedBytes",
        "type": "uint64"
      }
    ],
    "name": "IncrementalMemberSelected",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "snapshotProof",
        "type": "address"
      }
    ],
    "name": "SnapshotProofBound",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "ABANDON_DEPLOYMENT_MIGRATION",
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
    "name": "ABANDON_OPERATOR_AUDIT_RECOVERY",
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
    "name": "ABANDON_REASON_MAX",
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
    "name": "ABANDON_RECOVERY_UNCERTAIN",
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
    "name": "ABANDON_UNRECOVERABLE_SELECTED_SNAPSHOT",
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
    "name": "BATCH_REASON_INCREMENTAL",
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
    "name": "FULL_SWEEP_MODE_MAX",
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
    "name": "MAX_INCREMENTAL_BATCH_MEMBERS",
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
    "name": "MAX_SELECTED_MEMBERS",
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
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "internalType": "uint8",
        "name": "reason",
        "type": "uint8"
      }
    ],
    "name": "abandonBatch",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
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
    "name": "activeBatchIdOf",
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
    "name": "activeCampaign",
    "outputs": [
      {
        "internalType": "enum CapacityIncrementalBatchSC.CampaignKind",
        "name": "kind",
        "type": "uint8"
      },
      {
        "internalType": "uint64",
        "name": "authorityId",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "name": "batches",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
      },
      {
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "targetRound",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "cutoffNonce",
        "type": "uint64"
      },
      {
        "internalType": "uint8",
        "name": "reason",
        "type": "uint8"
      },
      {
        "internalType": "uint32",
        "name": "selectedPartitions",
        "type": "uint32"
      },
      {
        "internalType": "uint32",
        "name": "acceptedPartitions",
        "type": "uint32"
      },
      {
        "internalType": "uint64",
        "name": "selectedBytes",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "acceptedBytes",
        "type": "uint64"
      },
      {
        "internalType": "bool",
        "name": "active",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "completed",
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
        "name": "snapshotProof_",
        "type": "address"
      }
    ],
    "name": "bindSnapshotProof",
    "outputs": [],
    "stateMutability": "nonpayable",
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
    "name": "campaignOf",
    "outputs": [
      {
        "internalType": "enum CapacityIncrementalBatchSC.CampaignKind",
        "name": "kind",
        "type": "uint8"
      },
      {
        "internalType": "uint64",
        "name": "authorityId",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "capacityProof",
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
    "name": "certification",
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
        "internalType": "uint64",
        "name": "authorityId",
        "type": "uint64"
      },
      {
        "internalType": "uint8",
        "name": "mode",
        "type": "uint8"
      }
    ],
    "name": "claimFullCampaign",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "name": "fullSweepModeOf",
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
    "name": "getActiveBatch",
    "outputs": [
      {
        "components": [
          {
            "internalType": "uint64",
            "name": "batchId",
            "type": "uint64"
          },
          {
            "internalType": "address",
            "name": "vk",
            "type": "address"
          },
          {
            "internalType": "uint64",
            "name": "targetRound",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "cutoffNonce",
            "type": "uint64"
          },
          {
            "internalType": "uint8",
            "name": "reason",
            "type": "uint8"
          },
          {
            "internalType": "uint32",
            "name": "selectedPartitions",
            "type": "uint32"
          },
          {
            "internalType": "uint32",
            "name": "acceptedPartitions",
            "type": "uint32"
          },
          {
            "internalType": "uint64",
            "name": "selectedBytes",
            "type": "uint64"
          },
          {
            "internalType": "uint64",
            "name": "acceptedBytes",
            "type": "uint64"
          },
          {
            "internalType": "bool",
            "name": "active",
            "type": "bool"
          },
          {
            "internalType": "bool",
            "name": "completed",
            "type": "bool"
          }
        ],
        "internalType": "struct CapacityIncrementalBatchSC.Batch",
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
        "internalType": "bytes32",
        "name": "identityHash",
        "type": "bytes32"
      }
    ],
    "name": "isSelectedIdentity",
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
        "name": "kind",
        "type": "uint8"
      },
      {
        "internalType": "uint64",
        "name": "contentVersion",
        "type": "uint64"
      },
      {
        "internalType": "bytes32",
        "name": "contentHash",
        "type": "bytes32"
      },
      {
        "internalType": "uint64",
        "name": "committedBytes",
        "type": "uint64"
      }
    ],
    "name": "isSelectedPartition",
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
    "inputs": [],
    "name": "nextIncrementalSequence",
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
        "internalType": "uint64",
        "name": "targetRound",
        "type": "uint64"
      },
      {
        "internalType": "bytes32[]",
        "name": "partitionKeys",
        "type": "bytes32[]"
      }
    ],
    "name": "openBatch",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
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
        "internalType": "bytes32",
        "name": "identityHash",
        "type": "bytes32"
      }
    ],
    "name": "recordAcceptedMember",
    "outputs": [
      {
        "internalType": "bool",
        "name": "accepted",
        "type": "bool"
      }
    ],
    "stateMutability": "nonpayable",
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
    "name": "releaseFullCampaign",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
      },
      {
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      }
    ],
    "name": "selectedMember",
    "outputs": [
      {
        "components": [
          {
            "internalType": "bytes32",
            "name": "identityHash",
            "type": "bytes32"
          },
          {
            "internalType": "uint64",
            "name": "committedBytes",
            "type": "uint64"
          },
          {
            "internalType": "uint8",
            "name": "kind",
            "type": "uint8"
          },
          {
            "internalType": "bool",
            "name": "accepted",
            "type": "bool"
          }
        ],
        "internalType": "struct CapacityIncrementalBatchSC.SelectedMember",
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
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
      },
      {
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      }
    ],
    "name": "selectedMemberAccepted",
    "outputs": [
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      },
      {
        "internalType": "bool",
        "name": "accepted",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
      }
    ],
    "name": "selectedMemberCount",
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
        "internalType": "uint64",
        "name": "batchId",
        "type": "uint64"
      }
    ],
    "name": "selectedMemberKeys",
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
        "name": "registry",
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
    "name": "snapshotProof",
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
  }
] as const;
