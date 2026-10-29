// Generated from the compiled Cosmos recovery-v1 artifact.
export const DkgAttemptRegistryRecoveryEventABI = [
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
        "indexed": false,
        "internalType": "enum DkgAttemptRegistry.State",
        "name": "outcome",
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
        "internalType": "bytes32",
        "name": "attemptId",
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
        "indexed": false,
        "internalType": "uint64",
        "name": "sequence",
        "type": "uint64"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "termsHash",
        "type": "bytes32"
      }
    ],
    "name": "AttemptOpened",
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
        "indexed": false,
        "internalType": "uint64",
        "name": "workDeadline",
        "type": "uint64"
      }
    ],
    "name": "AttemptStarted",
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
      }
    ],
    "name": "DutyAccepted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [],
    "name": "EIP712DomainChanged",
    "type": "event"
  }
] as const;
