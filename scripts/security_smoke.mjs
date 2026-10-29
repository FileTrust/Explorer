#!/usr/bin/env node
// Small read-only deployment checks. No signing or transaction parameters.
import assert from 'node:assert/strict';
const base=(process.argv[2] || 'http://127.0.0.1:3001').replace(/\/$/,'');
const expected=process.argv[3]===undefined?null:Number(process.argv[3]);
async function get(path){
  const response=await fetch(base+path,{signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,200,path);return response.json();
}
const health=await get('/api/health');assert.equal(health.status,'ok');assert(health.checks.store?.configured,'Database-backed store is required');
const contracts=await get('/api/contracts');
assert(contracts.rows?.length>0,'Contract list is empty; check the web deployment settings');
if(expected!==null)assert.equal(contracts.rows.length,expected,'Deployed contract count changed');
let checked=0;
for(const row of contracts.rows){
  const info=await get('/api/contracts/'+encodeURIComponent(row.name));
  assert(Array.isArray(info.abi),row.name);assert.equal(typeof info.sourceCode,'string',row.name);assert(info.compiler?.version,row.name);
  checked++;await new Promise(resolve=>setTimeout(resolve,100));
}
for(const method of ['eth_accounts','personal_listAccounts','eth_sign','eth_sendTransaction','eth_sendRawTransaction','debug_traceCall']){
  const response=await fetch(base+'/api/rpc',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:[]}),signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,403,method);
}
for(const query of ['limit=-1','limit=1.5','cursor=not-a-valid-cursor']){
  const response=await fetch(base+'/api/index/events?'+query,{signal:AbortSignal.timeout(10000)});
  assert.equal(response.status,400,query);
}
console.log(JSON.stringify({health:health.status,contracts:checked,unsafeRpcDenied:true,inputValidation:true}));
