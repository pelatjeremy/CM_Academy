import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const projectRoot=fileURLToPath(new URL('../../../',import.meta.url));
export const target=JSON.parse(readFileSync(path.join(projectRoot,'deploy/railway-demo.json'),'utf8'));
export const cli=path.join(projectRoot,'backend/.local-tools/railway/node_modules/@railway/cli/bin/railway.exe');
export const identity=path.join(process.env.USERPROFILE,'.ssh/id_ed25519_cmh_documents_20261112');
export const sshOptions=['-T','-o','BatchMode=yes','-o','ConnectTimeout=15','-o','StrictHostKeyChecking=yes','-i',identity];
export function command(exe,args,{input,env,timeout=120000,privateLog}={}){
 const r=spawnSync(exe,args,{input,env:env||process.env,encoding:'utf8',windowsHide:true,timeout,maxBuffer:32*1024*1024});
 if(privateLog)writeFileSync(privateLog,JSON.stringify({status:r.status,stdout:r.stdout,stderr:r.stderr}),{mode:0o600});
 if(r.status!==0)throw Object.assign(new Error('Commande de maintenance en échec : '+path.basename(exe)),{code:r.error?.code||'COMMAND_FAILED'});
 return r.stdout;
}
export function remote(code,{privateLog}={}){
 const result=command('ssh',[...sshOptions,new URL(target.url).hostname+'@ssh.railway.com','cd /app/backend && node --input-type=module'],{input:code,privateLog});
 return JSON.parse(result);
}
export function databaseShell(script,{privateLog}={}){
 return command('ssh',[...sshOptions,'095d9726-3368-4cf6-b391-40f5c5044141@ssh.railway.com','sh -s'],{input:script,privateLog});
}
export const remoteSnapshot=`import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {Client} from 'pg';
const digest=x=>createHash('sha256').update(x).digest('hex');const db=new Client({connectionString:process.env.DATABASE_URL});await db.connect();await db.query("SET TIME ZONE 'UTC'");
const identity=(await db.query('SELECT current_database() AS name')).rows[0];if(identity.name!=='cmh_academy_demo')throw Error('WRONG_DATABASE');
const rows={},tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('AuthSession','_prisma_migrations') ORDER BY tablename")).rows;
for(const {tablename}of tables){if(!/^[A-Za-z_]+$/.test(tablename))throw Error('TABLE');const data=(await db.query('SELECT to_jsonb(t) AS row FROM "'+tablename+'" t')).rows.map(r=>r.row);data.sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0);rows[tablename]={count:data.length,sha256:digest(JSON.stringify(data))};}
const migrations=(await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at')).rows;await db.end();
const files=[];function walk(base,rel=''){for(const name of fs.readdirSync(path.join(base,rel)).sort()){const r=path.posix.join(rel,name),f=path.join(base,r),st=fs.lstatSync(f);if(st.isSymbolicLink())throw Error('SYMLINK');if(st.isDirectory())walk(base,r);else files.push({path:r,size:st.size,sha256:digest(fs.readFileSync(f))});}}walk(process.env.DOCUMENT_STORAGE_DIR);
console.log(JSON.stringify({database:identity.name,migrations,rows,files}));`;
