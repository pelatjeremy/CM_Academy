import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { Client } from 'pg';
import { isolatedDb, backend } from './lib/isolated-db.mjs';

assert(process.argv.includes('--apply'), 'Option --apply requise.');
const expectedHistory = [
  '20261022174525_creation_formations',
  '20261024150000_catalogue',
  '20261024180000_authentification',
  '20261025100000_consignes_sessions',
  '20261025160000_visibilite_sessions',
];
const target = '20261106120000_preinscriptions';
const variables = parseEnv(readFileSync(path.join(backend, '.env'), 'utf8'));
const destination = new URL(variables.DATABASE_URL);
assert(['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname), 'Hôte non local.');
assert.equal(decodeURIComponent(destination.pathname.slice(1)), 'cmh_academy_dev');
assert.equal(destination.port || '5432', '5432');
assert.equal(destination.searchParams.size, 0);

const backupRoot = path.join(backend, '.local-backups');
mkdirSync(backupRoot, { recursive: true });
const folder = mkdtempSync(path.join(backupRoot, 'preinscriptions-20261109-'));
const dump = path.join(folder, 'avant-preinscriptions.dump');
const bin = process.env.CMH_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const environment = Object.fromEntries(Object.entries(process.env).filter(
  ([key]) => !/^PG/i.test(key) && !['DATABASE_URL', 'SHADOW_DATABASE_URL', 'SESSION_SECRET'].includes(key),
));
const prismaEnvironment = {
  ...environment,
  DATABASE_URL: variables.DATABASE_URL,
  SHADOW_DATABASE_URL: variables.SHADOW_DATABASE_URL || '',
};
const events = [];
const hash = value => createHash('sha256').update(value).digest('hex');
const migrationsFolder = path.join(backend, 'prisma/migrations');
const migrationHash = name => hash(readFileSync(path.join(migrationsFolder, name, 'migration.sql')));
const db = new Client({ connectionString: variables.DATABASE_URL, connectionTimeoutMillis: 5000 });
let fixture;
let phase = 'initialisation';
let applied = false;

function record(message) {
  events.push(message);
  console.log(message);
}

function redact(value) {
  let result = String(value).replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi, '[connexion masquée]');
  for (const secret of [variables.DATABASE_URL, destination.password, decodeURIComponent(destination.password)]) {
    if (secret) result = result.replaceAll(secret, '[secret masqué]');
  }
  return result;
}

function command(executable, args, env = environment) {
  const result = spawnSync(executable, args, {
    cwd: backend, env, encoding: 'utf8', windowsHide: true, timeout: 120000,
  });
  writeFileSync(path.join(folder, 'diagnostics.log'),
    redact(path.basename(executable) + '\n' + (result.stdout || '') + '\n' + (result.stderr || '') + '\n'),
    { flag: 'a' });
  assert.equal(result.status, 0);
  return result.stdout;
}

const prisma = (...args) => command(process.execPath,
  [path.join(backend, 'node_modules/prisma/build/index.js'), ...args], prismaEnvironment);

async function identify() {
  const row = (await db.query(
    'SELECT current_database() AS db, current_user AS role, host(inet_server_addr()) AS host, inet_server_port() AS port',
  )).rows[0];
  assert.equal(row.db, 'cmh_academy_dev');
  assert.equal(row.role, 'cmh_app');
  assert(['127.0.0.1', '::1'].includes(row.host));
  assert.equal(row.port, 5432);
}

function checkFiles() {
  const files = readdirSync(migrationsFolder).filter(name => name !== 'migration_lock.toml').sort();
  assert.deepEqual(files, [...expectedHistory, target]);
}

async function snapshot(client) {
  const tables = ['Formation', 'Pole', 'Formateur', 'FormationFormateur', 'Session', 'Seance',
    'SessionAccesPrive', 'Utilisateur', 'AuthSession'];
  const rows = {};
  for (const table of tables) {
    // JSON trié pour inclure toutes les colonnes, sans écrire de contenu personnel dans les diagnostics.
    rows[table] = (await client.query(
      'SELECT * FROM public."' + table + '" ORDER BY row_to_json("' + table + '")::text',
    )).rows;
  }
  const history = (await client.query('SELECT * FROM public._prisma_migrations ORDER BY started_at')).rows;
  const columns = (await client.query(
    "SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position",
  )).rows;
  const constraints = (await client.query(
    "SELECT t.relname AS table_name,c.conname,c.contype,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.conname",
  )).rows;
  const indexes = (await client.query(
    "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname",
  )).rows;
  return { rows, history, columns, constraints, indexes };
}

try {
  phase = 'contrôle destination et historique';
  await db.connect();
  await identify();
  checkFiles();
  const before = await snapshot(db);
  assert.deepEqual(before.history.map(row => row.migration_name), expectedHistory);
  for (const row of before.history) {
    assert(row.finished_at && !row.rolled_back_at);
    assert.equal(row.checksum, migrationHash(row.migration_name));
  }

  phase = 'contrôle de divergence avant migration';
  const previousSchema = readFileSync(path.join(backend, 'prisma/baselines/avant-catalogue-public.prisma'), 'utf8')
    .replace(/(fuseauHoraire\s+String[^\n]*\n)/, '$1  visiblePubliquement Boolean @default(false)\n');
  assert(previousSchema.includes('visiblePubliquement'));
  const baseline = path.join(folder, 'avant-preinscriptions.prisma');
  writeFileSync(baseline, previousSchema);
  prisma('validate');
  prisma('migrate', 'diff', '--from-config-datasource', '--to-schema', baseline, '--exit-code');
  record('Destination locale cmh_academy_dev, cinq migrations et empreintes vérifiées. Seule migration attendue : ' + target);

  phase = 'sauvegarde';
  const pgEnvironment = {
    ...environment,
    PGHOST: destination.hostname === '[::1]' ? '::1' : destination.hostname,
    PGPORT: destination.port || '5432',
    PGDATABASE: 'cmh_academy_dev',
    PGUSER: decodeURIComponent(destination.username),
    PGPASSWORD: decodeURIComponent(destination.password),
  };
  command(path.join(bin, 'pg_dump.exe'), ['--format=custom', '--file', dump], pgEnvironment);
  const listing = command(path.join(bin, 'pg_restore.exe'), ['--list', dump]);
  assert(listing.includes('Formation') && listing.includes('Utilisateur') && listing.includes('_prisma_migrations'));
  record('Sauvegarde custom créée hors versionnement et archive lisible.');

  phase = 'restauration isolée';
  fixture = await isolatedDb();
  await fixture.guard();
  const restoreUrl = new URL(fixture.connectionString);
  const restoreEnvironment = {
    ...environment,
    PGHOST: restoreUrl.hostname, PGPORT: restoreUrl.port,
    PGDATABASE: decodeURIComponent(restoreUrl.pathname.slice(1)),
    PGUSER: decodeURIComponent(restoreUrl.username), PGPASSWORD: decodeURIComponent(restoreUrl.password),
  };
  command(path.join(bin, 'pg_restore.exe'),
    ['--exit-on-error', '--no-owner', '--no-acl', '--dbname', restoreEnvironment.PGDATABASE, dump],
    restoreEnvironment);
  await fixture.guard();
  assert.deepEqual(await snapshot({ query: fixture.sql }), before);
  record('Restauration sur un cluster neuf isolé comparée avec succès : données, colonnes, contraintes, index et historique.');
  await fixture.close();
  fixture = undefined;

  phase = 'application';
  await identify();
  checkFiles();
  assert.deepEqual(await snapshot(db), before);
  const checksums = [...expectedHistory, target].map(name => [name, migrationHash(name)]);
  prisma('migrate', 'deploy');
  applied = true;
  for (const [name, checksum] of checksums) assert.equal(migrationHash(name), checksum);
  record('Migration ' + target + ' appliquée avec prisma migrate deploy.');

  phase = 'génération et contrôles après migration';
  prisma('generate');
  prisma('migrate', 'status');
  prisma('migrate', 'diff', '--from-config-datasource', '--to-schema', 'prisma/schema.prisma', '--exit-code');
  const after = await snapshot(db);
  const normalized = structuredClone(after.rows);
  for (const row of normalized.Session) {
    assert.equal(row.preinscriptionsOuvertes, false);
    delete row.preinscriptionsOuvertes;
  }
  assert.deepEqual(normalized, before.rows);
  assert.deepEqual(after.history.filter(row => row.migration_name !== target), before.history);
  assert.equal(after.history.length, 6);
  const targetHistory = after.history.find(row => row.migration_name === target);
  assert(targetHistory.finished_at && !targetHistory.rolled_back_at);
  assert.equal(targetHistory.checksum, migrationHash(target));
  assert(after.columns.some(row => row.table_name === 'Session' && row.column_name === 'preinscriptionsOuvertes'
    && row.is_nullable === 'NO' && row.column_default === 'false'));
  for (const table of ['Inscription', 'ChangementInscription']) {
    assert.equal((await db.query('SELECT count(*)::int AS n FROM "' + table + '"')).rows[0].n, 0);
  }
  const foreignKeys = after.constraints.filter(row =>
    ['Inscription', 'ChangementInscription'].includes(row.table_name) && row.contype === 'f');
  assert.equal(foreignKeys.length, 3);
  assert(foreignKeys.every(row => row.definition.includes('ON DELETE RESTRICT')));
  for (const name of ['Inscription_email_normalise', 'Inscription_organisme_professionnel']) {
    assert(after.constraints.some(row => row.conname === name && row.contype === 'c'));
  }
  for (const name of ['Inscription_sessionId_email_key', 'Inscription_sessionId_statut_idx',
    'ChangementInscription_inscriptionId_date_idx', 'ChangementInscription_auteurId_idx']) {
    assert(after.indexes.some(row => row.indexname === name));
  }
  for (const old of before.constraints) assert(after.constraints.some(row => JSON.stringify(row) === JSON.stringify(old)));
  record('Client généré, six migrations terminées, schéma sans divergence, contraintes et index vérifiés.');
  record('Toutes les données antérieures sont conservées, visibilité identique, préinscriptions fermées et nouvelles tables vides.');
  writeFileSync(path.join(folder, 'resultats.json'), JSON.stringify({
    success: true, database: 'cmh_academy_dev', migration: target, backup: dump,
    backupSha256: hash(readFileSync(dump)), dataSha256: hash(JSON.stringify(before.rows)),
    counts: Object.fromEntries(Object.entries(before.rows).map(([table, rows]) => [table, rows.length])),
    events,
  }, null, 2));
} catch (error) {
  // Les messages d'assertion peuvent contenir des lignes personnelles : seul le code est conservé.
  const diagnostic = { success: false, applied, phase, code: error.code || error.name, events };
  writeFileSync(path.join(folder, 'resultats.json'), JSON.stringify(diagnostic, null, 2));
  console.error('STOP à la phase ' + phase + ' (' + diagnostic.code + '). Diagnostics conservés sans données personnelles.');
  process.exitCode = 1;
} finally {
  if (fixture) await fixture.close().catch(() => console.error('Arrêt du cluster de restauration à vérifier.'));
  await db.end().catch(() => {});
  console.log('Dossier privé non versionné : ' + folder);
}
