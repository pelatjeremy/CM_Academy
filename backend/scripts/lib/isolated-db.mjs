import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync, openSync, closeSync, realpathSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { Client } from 'pg';

export const backend = fileURLToPath(new URL('../../', import.meta.url));
export async function isolatedDb() {
  const base = path.join(backend, '.catalogue-test'); mkdirSync(base, { recursive: true });
  const run = mkdtempSync(path.join(base, 'auth-'));
  const data = path.join(run, 'data');
  const bin = process.env.CMH_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG/i.test(k) && !['DATABASE_URL','SHADOW_DATABASE_URL','SESSION_SECRET'].includes(k)));
  const password = randomBytes(32).toString('hex');
  const user = 'cmh_auth_test';
  const database = `cmh_auth_test_${randomBytes(6).toString('hex')}`;
  const pwfile = path.join(run, 'password.txt'); writeFileSync(pwfile, password, {flag:'wx',mode:0o600});
  function command(exe, args, extraEnv = {}) {
    const result = spawnSync(exe, args, {cwd:backend,env:{...env,...extraEnv},windowsHide:true,encoding:'utf8',timeout:120000});
    if(result.status !== 0) throw new Error(`Outil isolé en échec : ${path.basename(exe)}.`);
    return result.stdout;
  }
  command(path.join(bin,'initdb.exe'), ['-D',data,'-U',user,'--auth-host=scram-sha-256','--auth-local=scram-sha-256',`--pwfile=${pwfile}`,'--encoding=UTF8','--locale=C']);
  const probe=net.createServer(); await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));
  const port=probe.address().port; await new Promise(resolve=>probe.close(resolve));
  const fd=openSync(path.join(run,'postgres.log'),'a');
  const processDb=spawn(path.join(bin,'postgres.exe'),['-D',data,'-h','127.0.0.1','-p',String(port)],{env,stdio:['ignore',fd,fd],windowsHide:true});
  closeSync(fd); processDb.on('error',()=>{});
  let db;
  async function guard(expected = database) {
    const [row]=(await db.query(`SELECT current_database() AS db,current_setting('data_directory') AS dir,inet_server_port() AS port`)).rows;
    assert.equal(row.db,expected); assert.equal(row.port,port);
    assert.equal(realpathSync(row.dir).toLowerCase(),realpathSync(data).toLowerCase());
  }
  async function close() {
    if(db) await db.end().catch(()=>{});
    command(path.join(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-w','stop']);
  }
  try {
    for(let n=0;n<50;n++) {
      const client=new Client({host:'127.0.0.1',port,database:'postgres',user,password,connectionTimeoutMillis:1000});
      try { await client.connect(); db=client; break; } catch { await client.end().catch(()=>{}); }
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    assert(db); await guard('postgres');
    assert.equal((await db.query('SELECT 1 FROM pg_database WHERE datname=$1',[database])).rowCount,0);
    await db.query(`CREATE DATABASE "${database}"`); await db.end();
    db=new Client({host:'127.0.0.1',port,database,user,password,connectionTimeoutMillis:5000}); await db.connect(); await guard();
    const url=new URL(`postgresql://${user}@127.0.0.1:${port}/${database}`); url.password=password;
    return {run,connectionString:url.href,command,env,guard,close,rollback:()=>db.query('ROLLBACK'),
      sql:async(text,params=[])=>{await guard();return db.query(text,params);} };
  } catch(error) { await close().catch(()=>{}); throw error; }
}
