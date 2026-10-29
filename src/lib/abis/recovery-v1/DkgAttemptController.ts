// Generated from the compiled Cosmos recovery-v1 artifact.
export const DkgAttemptControllerRecoveryEventABI = [
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
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "compensation",
        "type": "uint256"
      }
    ],
    "name": "AttemptAccounted",
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
        "name": "registryId",
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
        "internalType": "bytes32",
        "name": "contextHash",
        "type": "bytes32"
      }
    ],
    "name": "AttemptBound",
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
        "indexed": false,
        "internalType": "bytes32",
        "name": "requestHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "evidence",
        "type": "address"
      }
    ],
    "name": "AttemptPrepared",
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
        "indexed": false,
        "internalType": "uint64",
        "name": "readyAt",
        "type": "uint64"
      }
    ],
    "name": "MaterialStageReady",
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
        "internalType": "address",
        "name": "guardian",
        "type": "address"
      }
    ],
    "name": "ReputationDeferred",
    "type": "event"
  }
] as const;
