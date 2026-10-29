export const TElGv2ABI = [
  {
    type: 'event',
    name: 'PreReadyDeclared',
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'requestId', type: 'uint256' },
      { indexed: true,  name: 'fileId',    type: 'bytes32' },
      { indexed: true,  name: 'guardian',  type: 'address' },
    ],
  },
  {
    type: 'event',
    name: 'V2AccessPartialSubmitted',
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'fileId',       type: 'bytes32' },
      { indexed: true,  name: 'requestId',    type: 'uint256' },
      { indexed: true,  name: 'guardian',     type: 'address' },
      { indexed: false, name: 'shareIndex',   type: 'uint8'   },
      { indexed: false, name: 'count',        type: 'uint256' },
      { indexed: false, name: 'partialsHash', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'V2BatchAccessPartialSubmitted',
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'fileId',      type: 'bytes32' },
      { indexed: true,  name: 'requestId',   type: 'uint256' },
      { indexed: true,  name: 'batchId',     type: 'uint256' },
      { indexed: false, name: 'guardian',    type: 'address' },
      { indexed: false, name: 'shareIndex',  type: 'uint8'   },
      { indexed: false, name: 'E1x',         type: 'uint256' },
      { indexed: false, name: 'E1y',         type: 'uint256' },
      { indexed: false, name: 'E2x',         type: 'uint256' },
      { indexed: false, name: 'E2y',         type: 'uint256' },
      { indexed: false, name: 'partialHash', type: 'bytes32' },
    ],
  },
  {
    type: 'event',
    name: 'PreBadPartialDetected',
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'requestId',  type: 'uint256' },
      { indexed: true,  name: 'fileId',     type: 'bytes32' },
      { indexed: true,  name: 'guardian',   type: 'address' },
      { indexed: false, name: 'shareIndex', type: 'uint8'   },
    ],
  },
  {
    type: 'event',
    name: 'PreRequestExpired',
    anonymous: false,
    inputs: [
      { indexed: true,  name: 'requestId',   type: 'uint256' },
      { indexed: true,  name: 'fileId',      type: 'bytes32' },
      { indexed: true,  name: 'requester',   type: 'address' },
      { indexed: false, name: 'absentCount', type: 'uint8'   },
    ],
  },
] as const;
