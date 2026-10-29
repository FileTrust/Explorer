export function contentSecurityPolicy(nonce, { development=false, publicUrls=[] }={}) {
  if (!/^[A-Za-z0-9+/=_-]{16,128}$/.test(nonce)) throw new Error('Invalid CSP nonce');
  const origins=new Set(["'self'",'https://challenges.cloudflare.com']);
  for(const value of publicUrls)try{
    const url=new URL(value);
    if(['http:','https:'].includes(url.protocol))origins.add(url.origin);
  }catch{ /* relative URLs are covered by self */ }
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com${development?" 'unsafe-eval'":''}`,
    "style-src 'self' 'unsafe-inline'", "img-src 'self' data:", "font-src 'self' data:",
    `connect-src ${[...origins].join(' ')}${development?' ws: wss:':''}`,
    'frame-src https://challenges.cloudflare.com', "frame-ancestors 'none'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'",
  ].join('; ');
}
