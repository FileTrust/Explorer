import { createRpcBudget, readLimitedBody, MAX_RESPONSE_BYTES, RpcPolicyError } from './rpc-policy.mjs';

function validateQuery(request) {
  if (request.url.length > 8192) throw new RpcPolicyError('Query is too large', 414);
  const params = new URL(request.url).searchParams;
  if ([...params].length > 128) throw new RpcPolicyError('Too many query parameters');
  for (const [key,value] of params) {
    if (key.length > 64 || value.length > 4096) throw new RpcPolicyError('Query parameter is too large');
    if (key === 'limit' && (!/^[1-9]\d{0,4}$/.test(value) || Number(value) > 10000)) throw new RpcPolicyError('Invalid page limit');
    if (['fromBlock','toBlock','number','height'].includes(key)
      && (!/^(?:0|[1-9]\d{0,18})$/.test(value) || BigInt(value) > 9223372036854775807n)) throw new RpcPolicyError('Invalid block number');
    if (key === 'cursor') {
      if (value.length > 512 || !/^[\w-]+$/.test(value)) throw new RpcPolicyError('Invalid page cursor');
      let cursor;
      try { cursor=JSON.parse(Buffer.from(value,'base64url').toString('utf8')); }
      catch { throw new RpcPolicyError('Invalid page cursor'); }
      const integer=(v)=>typeof v==='number' ? Number.isSafeInteger(v)&&v>=0 : typeof v==='string'&&/^\d{1,19}$/.test(v);
      const simple=typeof cursor==='string' && /^(?:0x[\da-f]{40}(?::\d{1,10})?|0x[\da-f]{64}|\d{1,19})$/i.test(cursor);
      const row=cursor && typeof cursor==='object' && !Array.isArray(cursor)
        && Object.keys(cursor).length>0 && Object.keys(cursor).every(k=>['blockNumber','number','transactionIndex','traceIndex','logIndex'].includes(k))
        && Object.values(cursor).every(integer);
      if (!simple && !integer(cursor) && !row) throw new RpcPolicyError('Invalid page cursor');
    }
  }
}

export function createReadGuard({ now=Date.now, concurrent=32, capacity=120, refill=60, maxEntries=128, maxBytes=16*1024*1024 }={}) {
  const rate=createRpcBudget({now,concurrent:Number.MAX_SAFE_INTEGER,capacity,refill});
  const admit=createRpcBudget({now,concurrent,capacity:Infinity,refill:0}), cache=new Map();let bytes=0;
  const remove=(key)=>{const entry=cache.get(key);if(entry){bytes-=entry.size;cache.delete(key);}};
  return async (request,operation,{ttlMs=2000,ignoreQuery=false}={})=>{
    let release;
    try {
      validateQuery(request);
      rate([{method:'read'}])();
      const url=new URL(request.url);url.searchParams.sort();
      const key=url.pathname+(ignoreQuery?'':url.search+'\n'+(request.headers.get('if-none-match') || ''));
      const existing=cache.get(key);
      if(existing && existing.until<=now())remove(key);
      let entry=cache.get(key);
      if(!entry){
        release=admit([{method:'read'}]);
        while(cache.size>=maxEntries)remove(cache.keys().next().value);
        entry={size:0,until:Infinity,promise:null};
        const current=entry;
        current.promise=(async()=>{
          const response=await operation();
          if(response.status>=500)throw new Error('Explorer backend unavailable');
          const text=await readLimitedBody(response,MAX_RESPONSE_BYTES);
          const size=Buffer.byteLength(text);
          if(cache.get(key)===current){
            if(ttlMs===0 || size>2*1024*1024 || size>maxBytes)remove(key);
            else {
              current.size=size;bytes+=size;
              while(bytes>maxBytes && cache.size)remove(cache.keys().next().value);
              current.until=now()+ttlMs;
            }
          }
          return {body:[204,205,304].includes(response.status)?null:text,status:response.status,headers:[...response.headers]};
        })();
        cache.set(key,current);
        current.promise.catch(()=>{if(cache.get(key)===current)remove(key);});
      }
      const result=await entry.promise;
      return new Response(result.body,{status:result.status,headers:result.headers});
    }catch(error){
      const policy=error instanceof RpcPolicyError;
      return Response.json({error:policy?(error.status===413?'Response exceeds Explorer limit; narrow your query':error.message):'Explorer is temporarily unavailable'},
        {status:policy?error.status:503,headers:{'Cache-Control':'no-store',...(policy&&error.status===429?{'Retry-After':'1'}:{})}});
    }finally{release?.();}
  };
}
// Route bundles share the process budget and cache, rather than each creating
// their own allowance. Explicit createReadGuard calls remain isolated for tests.
const GUARD_KEY=Symbol.for('filetrust.explorer.read.guard');
export const guardRead=globalThis[GUARD_KEY] ??= createReadGuard();
