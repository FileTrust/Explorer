export const AccessControlFTABI = [
  { type: 'event', name: 'RoleUpdated', anonymous: false, inputs: [
    { indexed: true, name: 'account', type: 'address' },
    { indexed: false, name: 'role', type: 'uint8' },
  ]},
  { type: 'event', name: 'FilePolicyCreated', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: true, name: 'dataOwner', type: 'address' },
    { indexed: false, name: 'threshold', type: 'uint8' },
    { indexed: false, name: 'guardianCount', type: 'uint256' },
  ]},
  { type: 'event', name: 'FilePolicyUpdated', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: true, name: 'dataOwner', type: 'address' },
    { indexed: false, name: 'threshold', type: 'uint8' },
    { indexed: false, name: 'guardianCount', type: 'uint256' },
  ]},
  { type: 'event', name: 'FilePolicyStatusChanged', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: false, name: 'active', type: 'bool' },
  ]},
  { type: 'event', name: 'FilePolicyModeSet', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: false, name: 'mode', type: 'uint8' },
  ]},
  { type: 'event', name: 'RequesterAddedToFile', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: true, name: 'requester', type: 'address' },
  ]},
  { type: 'event', name: 'RequesterRemovedFromFile', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: true, name: 'requester', type: 'address' },
  ]},
  { type: 'event', name: 'KeyGenRequestedForFile', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: true, name: 'dataOwner', type: 'address' },
  ]},
  { type: 'event', name: 'KeyGenRequestForFileCleared', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: true, name: 'dataOwner', type: 'address' },
  ]},
  { type: 'event', name: 'KeyGenRequestForFileExpired', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: true, name: 'dataOwner', type: 'address' },
  ]},
  { type: 'event', name: 'ReencRequestedForFile', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: true, name: 'requester', type: 'address' },
  ]},
  { type: 'event', name: 'ReencRequestForFileCleared', anonymous: false, inputs: [
    { indexed: true, name: 'fileId', type: 'bytes32' },
    { indexed: true, name: 'requester', type: 'address' },
  ]},
  { type: 'function', name: 'getAllFileIds', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'bytes32[]' }] },
  { type: 'function', name: 'getFilePolicyCount', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  // 0 none, 1 shareholder, 2 data owner, 3 requester.
  { type: 'function', name: 'getRole', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'getFileIdAt', stateMutability: 'view', inputs: [{ name: 'index', type: 'uint256' }], outputs: [{ name: '', type: 'bytes32' }] },
  { type: 'function', name: 'getFilePolicy', stateMutability: 'view',
    inputs: [{ name: 'fileId', type: 'bytes32' }],
    outputs: [
      { name: 'exists', type: 'bool' },
      { name: 'active', type: 'bool' },
      { name: 'dataOwner', type: 'address' },
      { name: 'threshold', type: 'uint8' },
      { name: 'selectedGuardians', type: 'address[]' },
    ]},
  { type: 'function', name: 'getFilePolicyMode', stateMutability: 'view', inputs: [{ name: 'fileId', type: 'bytes32' }], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'getGuardiansForFile', stateMutability: 'view', inputs: [{ name: 'fileId', type: 'bytes32' }], outputs: [{ name: '', type: 'address[]' }] },
  { type: 'function', name: 'hasRequestedKeyGenForFile', stateMutability: 'view', inputs: [{ name: 'fileId', type: 'bytes32' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'getKeyGenRequestedAtForFile', stateMutability: 'view', inputs: [{ name: 'fileId', type: 'bytes32' }], outputs: [{ name: '', type: 'uint64' }] },
  { type: 'function', name: 'isRequesterAllowedForFile', stateMutability: 'view',
    inputs: [{ name: 'fileId', type: 'bytes32' }, { name: 'requester', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }]},
] as const;
