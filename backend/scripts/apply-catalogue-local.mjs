// Application locale explicitement autorisée, avec sauvegarde restaurée avant DDL.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, openSync, closeSync, realpathSync, readdirSync } from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { Client } from 'pg';

assert(process.argv.includes('--apply'), 'Option --apply requise.');
const root = fileURLToPath(new URL('../', import.meta.url));
const variables = parseEnv(readFileSync(path.join(root, '.env'), 'utf8'));
const url = new URL(variables.DATABASE_URL);
assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'STOP : hôte non local.');
assert.equal(decodeURIComponent(url.pathname.slice(1)), 'cmh_academy_dev', 'STOP : base inattendue.');
assert.equal(url.port || '5432', '5432', 'STOP : port inattendu.');
assert.equal(url.searchParams.size, 0, 'STOP : options de connexion à examiner.');
const base = path.join(root, '.local-backups');
mkdirSync(base, { recursive: true });
const folder = mkdtempSync(path.join(base, 'catalogue-20261024-'));
const bin = 'C:/Program Files/PostgreSQL/18/bin';
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^PG/i.test(k) && !['DATABASE_URL','SHADOW_DATABASE_URL'].includes(k)));
const prismaEnv = { ...env, DATABASE_URL: variables.DATABASE_URL, SHADOW_DATABASE_URL: variables.SHADOW_DATABASE_URL || '' };
const initialName = '20261022174525_creation_formations';
const targetName = '20261024150000_catalogue';
const events = [];
let cluster;
let db;
let restored;
let applied = false;
const sha = value => createHash('sha256').update(value).digest('hex');
const redact = value => String(value).replaceAll(variables.DATABASE_URL, '[URL masquée]').replaceAll(decodeURIComponent(url.password), '[secret masqué]');
function record(message) { events.push(message); console.log(message); }
function tool(exe, args, toolEnv = env, allowed = [0]) {
  const result = spawnSync(exe, args, { cwd: root, env: toolEnv, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  writeFileSync(path.join(folder, 'diagnostics.log'), redact(`${path.basename(exe)} ${args.includes('deploy') ? 'migrate deploy' : ''}\n${result.stdout || ''}\n${result.stderr || ''}\n`), { flag: 'a' });
  assert(allowed.includes(result.status), `STOP : ${path.basename(exe)} a échoué (diagnostic local masqué).`);
  return result.stdout;
}
const cli = (...args) => tool(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), ...args], prismaEnv);
async function identify() {
  const row = (await db.query(`SELECT current_database() AS db, current_user AS role, host(inet_server_addr()) AS host, inet_server_port() AS port`)).rows[0];
  assert.equal(row.db, 'cmh_academy_dev'); assert.equal(row.role, 'cmh_app');
  assert(['127.0.0.1', '::1'].includes(row.host)); assert.equal(row.port, 5432);
}
async function snapshot(client) {
  const formations = (await client.query('SELECT id,titre,description,publiee,"createdAt","updatedAt" FROM public."Formation" ORDER BY id')).rows;
  const migrations = (await client.query('SELECT * FROM public._prisma_migrations ORDER BY started_at')).rows;
  const columns = (await client.query(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`)).rows;
  return { formations, migrations, columns };
}
async function portLibre() {
  const server = net.createServer();
  await new Promise((resolve,reject) => { server.on('error',reject); server.listen(0,'127.0.0.1',resolve); });
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
try {
  db = new Client({ connectionString: variables.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await db.connect(); await identify();
  const before = await snapshot(db);
  assert.equal(before.migrations.length, 1);
  assert.equal(before.migrations[0].migration_name, initialName);
  assert(before.migrations[0].finished_at && !before.migrations[0].rolled_back_at);
  assert.equal(before.migrations[0].checksum, sha(readFileSync(path.join(root, 'prisma/migrations', initialName, 'migration.sql'))));
  assert.deepEqual(readdirSync(path.join(root, 'prisma/migrations')).filter(n => n !== 'migration_lock.toml').sort(), [initialName,targetName]);
  cli('validate');
  cli('migrate','diff','--from-config-datasource','--to-schema','prisma/rollbacks/20261024150000_schema-avant.prisma','--exit-code');
  record('Destination locale, historique et absence de divergence vérifiés.');

  const pgEnv = { ...env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: 'cmh_academy_dev', PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
  const backup = path.join(folder, 'avant-catalogue.dump');
  tool(path.join(bin,'pg_dump.exe'), ['--format=custom','--file',backup], pgEnv);
  const listing = tool(path.join(bin,'pg_restore.exe'), ['--list',backup]);
  assert(listing.includes('Formation') && listing.includes('_prisma_migrations'));
  record('Sauvegarde custom créée ; archive lisible.');

  // Restauration réelle dans un nouveau cluster, jamais dans une base préexistante.
  const data = path.join(folder,'restore-cluster');
  const password = randomBytes(32).toString('hex');
  const passwordFile = path.join(folder,'restore-password.txt');
  writeFileSync(passwordFile,password,{flag:'wx',mode:0o600});
  tool(path.join(bin,'initdb.exe'), ['-D',data,'-U','cmh_restore_admin','--auth-host=scram-sha-256','--auth-local=scram-sha-256',`--pwfile=${passwordFile}`,'--encoding=UTF8','--locale=C']);
  const port = await portLibre();
  const fd = openSync(path.join(folder,'restore-postgres.log'),'a');
  cluster = spawn(path.join(bin,'postgres.exe'), ['-D',data,'-h','127.0.0.1','-p',String(port)], {env,stdio:['ignore',fd,fd],windowsHide:true});
  closeSync(fd); cluster.on('error',()=>{});
  for(let n=0;n<50;n++) {
    const client = new Client({host:'127.0.0.1',port,database:'postgres',user:'cmh_restore_admin',password,connectionTimeoutMillis:1000});
    try { await client.connect(); restored=client; break; } catch { await client.end().catch(()=>{}); }
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert(restored,'STOP : instance de restauration indisponible.');
  const dest=(await restored.query(`SELECT current_database() AS db,current_setting('data_directory') AS dir,inet_server_port() AS port`)).rows[0];
  assert.equal(dest.db,'postgres'); assert.equal(dest.port,port);
  assert.equal(realpathSync(dest.dir).toLowerCase(),realpathSync(data).toLowerCase());
  const restoreEnv={...env,PGHOST:'127.0.0.1',PGPORT:String(port),PGDATABASE:'postgres',PGUSER:'cmh_restore_admin',PGPASSWORD:password};
  tool(path.join(bin,'pg_restore.exe'),['--exit-on-error','--no-owner','--no-acl','--dbname=postgres',backup],restoreEnv);
  assert.deepEqual(await snapshot(restored),before);
  record('Sauvegarde restaurée et comparée : données, colonnes et historique identiques.');
  await restored.end(); restored=undefined;
  tool(path.join(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-w','stop']); cluster=undefined;

  await identify();
  assert.deepEqual(await snapshot(db), before, 'STOP : base modifiée depuis la sauvegarde.');
  cli('migrate','deploy'); applied=true;
  record('Migration versionnée appliquée par Prisma Migrate.');
  cli('generate'); record('Client Prisma régénéré.');
  cli('migrate','status');
  cli('migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--exit-code');
  const after = await snapshot(db);
  assert.deepEqual(after.formations,before.formations);
  assert.deepEqual(after.migrations.filter(m=>m.migration_name===initialName),before.migrations);
  const target=after.migrations.find(m=>m.migration_name===targetName);
  assert.equal(after.migrations.length,2); assert(target?.finished_at && !target.rolled_back_at);
  assert.equal(target.checksum,sha(readFileSync(path.join(root,'prisma/migrations',targetName,'migration.sql'))));
  const tables=(await db.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public'`)).rows.map(r=>r.table_name);
  for(const name of ['Pole','Formateur','FormationFormateur','Session','Seance','SessionAccesPrive']) assert(tables.includes(name));
  const constraints=(await db.query(`SELECT conname FROM pg_constraint c JOIN pg_namespace n ON c.connamespace=n.oid WHERE n.nspname='public'`)).rows.map(r=>r.conname);
  for(const name of ['Formation_slug_format_check','Formation_dureeMinutes_check','Formation_tarif_check','Formation_devise_check','Session_capacite_check','Session_fuseauHoraire_check','Seance_dates_check','Pole_slug_format_check','SessionAccesPrive_lien_check','Formation_poleId_fkey','FormationFormateur_formationId_fkey','FormationFormateur_formateurId_fkey','Session_formationId_fkey','Seance_sessionId_fkey','SessionAccesPrive_sessionId_fkey']) assert(constraints.includes(name));
  record(`Schéma, contraintes, historique et conservation des ${before.formations.length} formations vérifiés.`);
  writeFileSync(path.join(folder,'resultats.json'),JSON.stringify({success:true,database:'cmh_academy_dev',backup,backupSha256:sha(readFileSync(backup)),dataSha256:sha(JSON.stringify(before.formations)),events},null,2));
} catch(error) {
  console.error(`STOP : ${redact(error.code || error.message).slice(0,500)}`);
  writeFileSync(path.join(folder,'resultats.json'),JSON.stringify({success:false,applied,events,error:redact(error.code || error.message).slice(0,500)},null,2));
  process.exitCode=1;
} finally {
  if(restored) await restored.end().catch(()=>{});
  if(db) await db.end().catch(()=>{});
  if(cluster) {
    try { tool(path.join(bin,'pg_ctl.exe'),['-D',path.join(folder,'restore-cluster'),'-m','fast','-w','stop']); }
    catch { console.error('Instance de restauration : arrêt à vérifier.'); }
  }
  console.log(`Dossier privé non versionné : ${folder}`);
}
