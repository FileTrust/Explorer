import { NextRequest, NextResponse } from 'next/server';
import { contentSecurityPolicy } from '@/lib/csp.mjs';

export function proxy(request: NextRequest) {
  const nonce=Buffer.from(crypto.randomUUID()).toString('base64');
  const csp=contentSecurityPolicy(nonce,{
    development:process.env.NODE_ENV==='development',
    publicUrls:[process.env.NEXT_PUBLIC_RPC_URL || '',process.env.NEXT_PUBLIC_FTU_PRICE_URL || ''],
  });
  const headers=new Headers(request.headers);
  // Override caller-supplied values. Next uses this request policy to nonce
  // its own inline scripts during dynamic rendering.
  headers.set('x-nonce',nonce);
  headers.set('Content-Security-Policy',csp);
  const response=NextResponse.next({request:{headers}});
  response.headers.set('Content-Security-Policy',csp);
  response.headers.set('Cache-Control','private, no-store');
  return response;
}

export const config={matcher:['/((?!api|_next/static|_next/image|favicon.ico|filetrust-logo.jpg).*)']};
