#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let reader;
try { reader=parseEnv(readFileSync(path.join(root,'.env.web'),'utf8')); }
catch { console.error('Install Explorer first to provision its public database reader.');process.exit(1); }
const child=spawn(process.execPath,[path.join(root,'node_modules/next/dist/bin/next'),'start','--port',process.env.PORT || '3001',...process.argv.slice(2)],{
  cwd:root,stdio:'inherit',env:{...process.env,...reader,NODE_ENV:'production'},
});
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>child.kill(sig));
child.on('error',()=>{console.error('Could not start Explorer.');process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code ?? (signal ? 1 : 0);});
