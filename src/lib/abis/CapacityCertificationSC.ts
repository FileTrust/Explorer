// Auto-generated from Blockchain/artifacts (functions + events). Read-only Explorer ABI.
export const CapacityCertificationSCABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "capacityProof",
        "type": "address"
      }
    ],
    "name": "CapacityProofBound",
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
      }
    ],
    "name": "PartitionCertificationInvalidated",
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
        "name": "kind",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "certifiedBytes",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "uint64",
        "name": "expirySlot",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "identityHash",
        "type": "bytes32"
      }
    ],
    "name": "PartitionCertified",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "MAX_CERTIFICATION_RING_SIZE",
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
        "name": "capacityProof",
        "type": "address"
      }
    ],
    "name": "bindCapacityProof",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "capacityProofSC",
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
        "name": "",
        "type": "address"
      },
      {
        "internalType": "uint16",
        "name": "",
        "type": "uint16"
      }
    ],
    "name": "certificationBuckets",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "expirySlot",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "certifiedFreeBytes",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "certifiedDataBytes",
        "type": "uint64"
      },
      {
        "internalType": "uint32",
        "name": "partitionCount",
        "type": "uint32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
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
        "internalType": "bool",
        "name": "active",
        "type": "bool"
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
    "name": "certificationIdentityHash",
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
    "name": "certificationMaxProofAgeSeconds",
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
        "name": "vk",
        "type": "address"
      }
    ],
    "name": "certifiedData",
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
        "name": "vk",
        "type": "address"
      }
    ],
    "name": "certifiedFree",
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
        "name": "vk",
        "type": "address"
      }
    ],
    "name": "certifiedTotals",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "freeBytes",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "dataBytes",
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
        "internalType": "bool",
        "name": "active",
        "type": "bool"
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
    "name": "certifyPartition",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "currentCertificationSlot",
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
        "name": "partitionKey",
        "type": "bytes32"
      }
    ],
    "name": "invalidatePartition",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "bytes32",
        "name": "partitionKey",
        "type": "bytes32"
      }
    ],
    "name": "isCertificationFresh",
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
        "name": "partitionKey",
        "type": "bytes32"
      },
      {
        "internalType": "bytes32",
        "name": "identityHash",
        "type": "bytes32"
      }
    ],
    "name": "isCertifiedCurrent",
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
    "name": "partitionCertifications",
    "outputs": [
      {
        "internalType": "address",
        "name": "vk",
        "type": "address"
      },
      {
        "internalType": "uint64",
        "name": "provedAt",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "certifiedExpirySlot",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "certifiedBytes",
        "type": "uint64"
      },
      {
        "internalType": "uint8",
        "name": "certifiedKind",
        "type": "uint8"
      },
      {
        "internalType": "bytes32",
        "name": "certifiedIdentityHash",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "ringSize",
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
        "internalType": "uint64",
        "name": "declared",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "allocated",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "reserved",
        "type": "uint64"
      },
      {
        "internalType": "uint64",
        "name": "margin",
        "type": "uint64"
      }
    ],
    "name": "safeAllocatableBytes",
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
    "name": "slotSeconds",
    "outputs": [
      {
        "internalType": "uint64",
        "name": "",
        "type": "uint64"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
