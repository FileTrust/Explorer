import coreWebVitals from 'eslint-config-next/core-web-vitals';

// Next 16 removed `next lint`, so the config that used to be implicit lives here.
// core-web-vitals matches what `next lint` set up; the stricter `next/typescript`
// preset is left off because this project has never been linted against it.
export default [
  { ignores: ['.next/**', '.next.*/**', 'node_modules/**', 'public/index/**'] },
  ...coreWebVitals,
];
