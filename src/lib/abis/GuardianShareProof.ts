export const GuardianShareProofABI = [
  { type: 'event', name: 'PolicyServicePeriodSet', anonymous: false, inputs: [
    { indexed: true,  name: 'policyId',     type: 'bytes32' },
    { indexed: true,  name: 'dataOwner',    type: 'address' },
    { indexed: false, name: 'serviceStart', type: 'uint256' },
    { indexed: false, name: 'serviceEnd',   type: 'uint256' },
    { indexed: false, name: 'durationDays', type: 'uint256' },
  ]},
  { type: 'event', name: 'GuardianPublicShareRegistered', anonymous: false, inputs: [
    { indexed: true,  name: 'policyId',     type: 'bytes32' },
    { indexed: true,  name: 'keyEpoch',     type: 'uint32'  },
    { indexed: true,  name: 'guardian',     type: 'address' },
    { indexed: false, name: 'shareVersion', type: 'uint32'  },
    { indexed: false, name: 'shareIndex',   type: 'uint8'   },
    { indexed: false, name: 'publicShareX', type: 'uint256' },
    { indexed: false, name: 'publicShareY', type: 'uint256' },
  ]},
  { type: 'event', name: 'ShareProofSubmitted', anonymous: false, inputs: [
    { indexed: true,  name: 'policyId',   type: 'bytes32' },
    { indexed: true,  name: 'keyEpoch',   type: 'uint32'  },
    { indexed: true,  name: 'guardian',   type: 'address' },
    { indexed: false, name: 'proofEpoch', type: 'uint256' },
    { indexed: false, name: 'valid',      type: 'bool'    },
  ]},
  { type: 'event', name: 'ShareProofMissed', anonymous: false, inputs: [
    { indexed: true,  name: 'policyId',   type: 'bytes32' },
    { indexed: true,  name: 'keyEpoch',   type: 'uint32'  },
    { indexed: true,  name: 'guardian',   type: 'address' },
    { indexed: false, name: 'proofEpoch', type: 'uint256' },
  ]},
] as const;
