// Generated from the compiled Cosmos recovery-v1 artifact.
export const DkgAttemptEscrowRecoveryEventABI = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "attemptId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "dataOwner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "priceHash",
        "type": "bytes32"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "AttemptFunded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "attemptId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "dataOwner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "AttemptRefunded",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "attemptId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "guardian",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "BondReserved",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "attemptId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "guardian",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "BondReturned",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "account",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "Claimed",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "attemptId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "guardian",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "dataOwner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "CompensationCredited",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "attemptId",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "guardian",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint8",
        "name": "action",
        "type": "uint8"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "WorkCredited",
    "type": "event"
  }
] as const;
