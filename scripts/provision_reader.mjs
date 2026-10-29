#!/usr/bin/env node
// Separate public readers from migrations/indexing. Secrets are never logged.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { createClient } from '@clickhouse/client';
import { selectWebSettings, readerName } from './web_settings.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(app, '.env.local'), webPath = path.join(app, '.env.web');
const settings = parseEnv(readFileSync(envPath, 'utf8'));
const managedData = path.resolve(settings.EXPLORER_STORE_DATA || path.join(homedir(), '.filetrust-data'));
process.loadEnvFile(envPath);
const { postgresConfig } = await import('../src/lib/db/postgres.mjs');
const ident = pg.escapeIdentifier, literal = pg.escapeLiteral;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const secret = () => randomBytes(32).toString('hex');
const oldWeb = existsSync(webPath) ? parseEnv(readFileSync(webPath, 'utf8')) : {};
const backup = path.join(app, '.security-backups', new Date().toISOString().replaceAll(':', '-'));
mkdirSync(backup, { recursive: true, mode: 0o700 });
chmodSync(path.dirname(backup), 0o700); chmodSync(backup, 0o700);
for (const file of [envPath, webPath]) if (existsSync(file)) copyFileSync(file, path.join(backup, path.basename(file)));

function saveEnv(file, values) {
  const text = Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(String(value))}`).join('\n') + '\n';
  writeFileSync(file, text, { mode: 0o600 }); chmodSync(file, 0o600);
}
function verifier(password) {
  const salt = randomBytes(16), salted = pbkdf2Sync(password, salt, 4096, 32, 'sha256');
  const key = (label) => createHmac('sha256', salted).update(label).digest();
  return `SCRAM-SHA-256$4096:${salt.toString('base64')}$${createHash('sha256').update(key('Client Key')).digest('base64')}:${key('Server Key').toString('base64')}`;
}
const web = selectWebSettings(settings);
const client = new pg.Client({ ...postgresConfig(), connectionTimeoutMillis: 5000 });
let ch;
try {
  await client.connect();
  const { rows: [info] } = await client.query("SELECT current_user AS owner, current_database() AS database, current_setting('hba_file') AS hba");
  const role = readerName(oldWeb.PGDATABASE===info.database && oldWeb.PGUSER!==info.owner?oldWeb.PGUSER:undefined,info.database);
  const pgPassword = role===oldWeb.PGUSER ? oldWeb.PGPASSWORD || secret() : secret();
  const existing = await client.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
  if (!existing.rowCount) await client.query(`CREATE ROLE ${ident(role)} LOGIN`);
  await client.query(`ALTER ROLE ${ident(role)} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 8 PASSWORD ${literal(verifier(pgPassword))}`);
  await client.query(`GRANT CONNECT ON DATABASE ${ident(info.database)} TO ${ident(role)}`);
  await client.query(`GRANT USAGE ON SCHEMA public TO ${ident(role)}`);
  await client.query(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO ${ident(role)}`);
  await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE ${ident(info.owner)} IN SCHEMA public GRANT SELECT ON TABLES TO ${ident(role)}`);
  for (const [key, value] of Object.entries({ statement_timeout:'3s', lock_timeout:'1s', idle_in_transaction_session_timeout:'3s',
    default_transaction_read_only:'on', work_mem:'4MB', temp_file_limit:'64MB', max_parallel_workers_per_gather:'0' })) {
    await client.query(`ALTER ROLE ${ident(role)} SET ${key} = ${literal(value)}`);
  }
  Object.assign(web, { PGUSER:role, PGPASSWORD:pgPassword, PGDATABASE:info.database, PGPOOL_MAX:'6', PGSTATEMENT_TIMEOUT_MS:'3000' });
  if (settings.DATABASE_URL) {
    const url = new URL(settings.DATABASE_URL); url.username=role;url.password=pgPassword;
    for(const key of ['user','password'])url.searchParams.delete(key);
    web.DATABASE_URL=url.href;
  }
  // Only alter authentication for the cluster installed and owned by this app.
  const localPg = !settings.DATABASE_URL && (settings.PGHOST || '127.0.0.1') === '127.0.0.1'
    && Number(settings.PGPORT) === Number(settings.EXPLORER_POSTGRES_PORT || '5433') && realpathSync(info.hba).startsWith(path.join(managedData, 'postgres') + path.sep);
  if (localPg) {
    const adminPassword = settings.PGPASSWORD || secret();
    await client.query(`ALTER ROLE ${ident(info.owner)} PASSWORD ${literal(verifier(adminPassword))}`);
    settings.PGPASSWORD=adminPassword;
    copyFileSync(info.hba, path.join(backup, 'pg_hba.conf'));
    const hba=readFileSync(info.hba,'utf8').split('\n').map((line) => {
      if (/^\s*host\s/.test(line) && /\btrust\s*(?:#.*)?$/.test(line)) return line.replace(/\btrust\b/, 'scram-sha-256');
      if (/^\s*local\s/.test(line) && /\btrust\s*(?:#.*)?$/.test(line)) return line.replace(/\btrust\b/, 'peer');
      return line;
    }).join('\n');
    // Persist credentials before changing connection authentication.
    saveEnv(envPath,settings);writeFileSync(info.hba,hba);await client.query('SELECT pg_reload_conf()');
    const admin = new pg.Client({ ...postgresConfig(), password:adminPassword });
    await admin.connect();await admin.end();
    let denied=false;
    for(let attempt=0;attempt<10;attempt++) {
      const wrong=new pg.Client({ ...postgresConfig(), password:'deliberately-incorrect', connectionTimeoutMillis:3000 });
      try { await wrong.connect(); }
      catch(error) { if(error.code==='28P01')denied=true;else throw error; }
      finally { await wrong.end().catch(()=>{}); }
      if(denied)break;
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    if(!denied)throw new Error('Local PostgreSQL authentication is still permissive');
  }
  if (settings.CLICKHOUSE_URL) {
    const database=settings.CLICKHOUSE_DATABASE || info.database;
    const chIdent=(value)=>'`'+String(value).replaceAll('`','``')+'`';
    ch=createClient({url:settings.CLICKHOUSE_URL,username:settings.CLICKHOUSE_USER || 'default',password:settings.CLICKHOUSE_PASSWORD || '',database});
    const [administrator]=await(await ch.query({query:'SELECT currentUser() AS name',format:'JSONEachRow'})).json();
    const chUser=readerName(oldWeb.CLICKHOUSE_DATABASE===database && oldWeb.CLICKHOUSE_USER!==administrator.name?oldWeb.CLICKHOUSE_USER:undefined,database);
    const chPassword=chUser===oldWeb.CLICKHOUSE_USER ? oldWeb.CLICKHOUSE_PASSWORD || secret() : secret();
    Object.assign(web,{CLICKHOUSE_USER:chUser,CLICKHOUSE_PASSWORD:chPassword,CLICKHOUSE_DATABASE:database});
    const readerUrl=new URL(settings.CLICKHOUSE_URL);
    readerUrl.username='';readerUrl.password='';
    for(const key of ['user','username','password'])readerUrl.searchParams.delete(key);
    web.CLICKHOUSE_URL=readerUrl.href;
    const adminXml=path.join(managedData,'clickhouse','etc','users.xml');
    const localCh=new URL(settings.CLICKHOUSE_URL).hostname==='127.0.0.1' && new URL(settings.CLICKHOUSE_URL).port===String(settings.EXPLORER_CLICKHOUSE_PORT || '8123')
      && administrator.name==='default' && existsSync(adminXml);
    if (localCh) {
      const password=settings.CLICKHOUSE_PASSWORD || secret();
      copyFileSync(adminXml,path.join(backup,'clickhouse-users.xml'));
      const patch=spawnSync('python3',['-c',
        `import sys,json,xml.etree.ElementTree as E
p=sys.argv[1]; d=json.load(sys.stdin); t=E.parse(p); root=t.getroot()
u=root.find('./users/default'); assert u is not None
for x in list(u):
 if x.tag in ('password','password_sha256_hex','password_double_sha1_hex'):u.remove(x)
E.SubElement(u,'password_sha256_hex').text=d['hash']
profiles=root.find('profiles'); users=root.find('users')
old=profiles.find('explorer_reader')
if old is not None:profiles.remove(old)
profile=E.SubElement(profiles,'explorer_reader')
for key,value in {'readonly':'1','max_execution_time':'3','max_memory_usage':'268435456','max_concurrent_queries_for_user':'4','max_rows_to_read':'5000000','max_result_rows':'10000','max_result_bytes':'8388608','result_overflow_mode':'throw','read_overflow_mode':'throw','max_threads':'2'}.items():E.SubElement(profile,key).text=value
old=users.find(d['user'])
if old is not None:users.remove(old)
reader=E.SubElement(users,d['user'])
E.SubElement(reader,'password_sha256_hex').text=d['readerHash']
E.SubElement(E.SubElement(reader,'networks'),'ip').text='127.0.0.1'
E.SubElement(reader,'profile').text='explorer_reader'
E.SubElement(reader,'quota').text='default'
E.SubElement(E.SubElement(reader,'grants'),'query').text=d['grant']
t.write(p,encoding='unicode')`,adminXml],
        {input:JSON.stringify({hash:hash(password),readerHash:hash(chPassword),user:chUser,grant:`GRANT SELECT ON ${chIdent(database)}.*`}),encoding:'utf8'});
      if (patch.status!==0) throw new Error('Could not update local ClickHouse authentication');
      settings.CLICKHOUSE_PASSWORD=password;saveEnv(envPath,settings);chmodSync(adminXml,0o600);
      await ch.command({query:'SYSTEM RELOAD CONFIG'}).catch(()=>{});
      await ch.close();ch=undefined;
      const secured=createClient({url:settings.CLICKHOUSE_URL,username:'default',password,database});
      let verified=false;
      try {
        for(let attempt=0;attempt<20;attempt++) {
          try { await(await secured.query({query:'SELECT 1',format:'JSONEachRow'})).json();verified=true;break; }
          catch { await new Promise(resolve=>setTimeout(resolve,500)); }
        }
      } finally { await secured.close(); }
      if(!verified)throw new Error('Local ClickHouse password did not become active');
    } else {
      await ch.command({query:`CREATE USER IF NOT EXISTS ${chIdent(chUser)} IDENTIFIED WITH sha256_hash BY '${hash(chPassword)}'`});
      await ch.command({query:`ALTER USER ${chIdent(chUser)} IDENTIFIED WITH sha256_hash BY '${hash(chPassword)}' SETTINGS readonly=1 READONLY, max_execution_time=3 MAX 3, max_memory_usage=268435456 MAX 268435456, max_concurrent_queries_for_user=4 MAX 4, max_rows_to_read=5000000 MAX 5000000, max_result_rows=10000 MAX 10000, max_result_bytes=8388608 MAX 8388608, result_overflow_mode='throw' READONLY, read_overflow_mode='throw' READONLY, max_threads=2 MAX 2`});
      await ch.command({query:`GRANT SELECT ON ${chIdent(database)}.* TO ${chIdent(chUser)}`});
    }
  }
  saveEnv(envPath,settings);saveEnv(webPath,web);
  // Verify fresh connections with the generated public-reader credentials.
  const reader=new pg.Client(web.DATABASE_URL ? {connectionString:web.DATABASE_URL} : {
    host:web.PGHOST || '127.0.0.1',port:Number(web.PGPORT || 5432),database:web.PGDATABASE,user:web.PGUSER,password:web.PGPASSWORD,
  });
  await reader.connect();
  try {
    const {rows:[row]}=await reader.query("SELECT current_user AS name, rolsuper, rolcreaterole, has_table_privilege(current_user,'event','INSERT') AS can_write FROM pg_roles WHERE rolname=current_user");
    if(row.name!==role || row.rolsuper || row.rolcreaterole || row.can_write)throw new Error('Reader privileges are too broad');
    await reader.query('SELECT count(*) FROM schema_migration');
  }finally{await reader.end();}
  if(web.CLICKHOUSE_URL){
    const readerCh=createClient({url:web.CLICKHOUSE_URL,username:web.CLICKHOUSE_USER,password:web.CLICKHOUSE_PASSWORD,database:web.CLICKHOUSE_DATABASE});
    try{
      const [identity]=await(await readerCh.query({query:'SELECT currentUser() AS name',format:'JSONEachRow'})).json();
      const [mode]=await(await readerCh.query({query:"SELECT value FROM system.settings WHERE name='readonly'",format:'JSONEachRow'})).json();
      if(identity.name!==web.CLICKHOUSE_USER || mode.value!=='1')throw new Error('ClickHouse reader identity is not restricted');
      await(await readerCh.query({query:'SELECT count() FROM event',format:'JSONEachRow'})).json();
    }finally{await readerCh.close();}
  }
  console.log('Public database reader provisioned and verified. Private backups:',backup);
} catch(error) {
  // Driver messages can include SQL/authentication material: log only the code.
  console.error('Reader provisioning failed:',error.code || error.name,'Private backups:',backup);
  writeFileSync(path.join(backup,'error.json'),JSON.stringify({code:error.code,message:error.message}),{mode:0o600});
  process.exitCode=1;
} finally {await client.end().catch(()=>{});if(ch)await ch.close().catch(()=>{});}
