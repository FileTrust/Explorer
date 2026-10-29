const os = require('node:os');

/** Development origins are resolved locally; optional extras use EXPLORER_DEV_ORIGINS. */
function reachableHosts() {
  const hosts = new Set(['127.0.0.1', 'localhost', '::1']);

  for (const addresses of Object.values(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (!address.internal) hosts.add(address.address);
    }
  }

  for (const extra of (process.env.EXPLORER_DEV_ORIGINS ?? '').split(',')) {
    const host = extra.trim();
    if (host) hosts.add(host);
  }

  return [...hosts];
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  outputFileTracingExcludes: {
    '/*': ['./.env*', './.security-backups/**', './.deployment-backups/**', './.git/**'],
  },
  // Only a small local logo uses next/image; serve it directly and avoid
  // exposing an unnecessary server-side image transformation endpoint.
  images: { unoptimized: true },
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ] }];
  },
  allowedDevOrigins: reachableHosts(),
  // `next dev` otherwise writes its own AGENTS.md and CLAUDE.md into this folder
  // on every run. The repo already keeps its agent instructions at the root.
  agentRules: false,
};

module.exports = nextConfig;
