// Aucun chargement de .env : toutes les écritures ciblent une instance créée ici.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, realpathSync, openSync, closeSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from 'pg';
import { createPrismaAdapter } from '../lib/prisma-adapter.js';

const backend = fileURLToPath(new URL('../', import.meta.url));
const bin = process.env.CMH_PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const runs = path.join(backend, '.catalogue-test');
mkdirSync(runs, { recursive: true });
const run = mkdtempSync(path.join(runs, 'run-'));
const data = path.join(run, 'data');
const database = `cmh_catalogue_test_${randomBytes(6).toString('hex')}`;
const role = 'cmh_catalogue_test_admin';
const password = randomBytes(32).toString('hex');
const log = [];
let started = false;
let db;
let prisma;
let api;
let postgres;

function record(name) {
  log.push(name);
  console.log(`PASS ${name}`);
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

// Ne pas afficher stdout/stderr des outils : ils pourraient contenir une URL.
function command(executable, args, env = process.env) {
  const result = spawnSync(executable, args, {
    cwd: backend, env, encoding: 'utf8', windowsHide: true, timeout: 120000,
  });
  if (result.status !== 0) {
    const error = new Error('Outil de test en échec.');
    error.safeDetail = `${path.basename(executable)} (code ${result.status ?? 'indisponible'}) : ${String(result.stderr || result.error?.message || result.stdout).replaceAll(connectionString, '[URL masquée]').replaceAll(password, '[secret masqué]').slice(0, 1600)}`;
    throw error;
  }
  return result.stdout;
}

const canonical = value => realpathSync(value).replaceAll('\\', '/').toLowerCase();
const port = await freePort();
const url = new URL(`postgresql://${role}@127.0.0.1:${port}/${database}`);
url.password = password;
const connectionString = url.href;
// Retirer toute configuration de connexion héritée, y compris celle de Prisma.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^PG/i.test(key) && !['DATABASE_URL', 'SHADOW_DATABASE_URL', 'DIRECT_URL'].includes(key)
));
env.CMH_CATALOGUE_TEST_DATABASE_URL = connectionString;
env.SESSION_SECRET = randomBytes(48).toString('hex');

async function destination(client, expectedDatabase = database) {
  const { rows: [identity] } = await client.query(`SELECT current_database() AS db,
    current_user AS role, current_setting('data_directory') AS directory,
    inet_server_port() AS port, host(inet_server_addr()) AS host`);
  assert.equal(identity.db, expectedDatabase);
  assert.equal(identity.role, role);
  assert.equal(identity.host, '127.0.0.1');
  assert.equal(identity.port, port);
  assert.equal(canonical(identity.directory), canonical(data));
}

async function sql(text, params = []) {
  await destination(db);
  return db.query(text, params);
}

async function rejected(name, text, params, code) {
  try {
    await sql(text, params);
    assert.fail(`La base a accepté : ${name}`);
  } catch (error) {
    assert.equal(error.code, code, name);
  }
  record(`rejet SQL : ${name} (${code})`);
}

const cli = path.join(backend, 'node_modules/prisma/build/index.js');
const config = path.join(run, 'prisma.config.ts');
function prismaCommand(...args) {
  return command(process.execPath, [cli, ...args, '--config', config], env);
}

async function rollbackRejected(name) {
  try {
    await sql(readFileSync(path.join(backend, 'prisma/rollbacks/20261024150000_catalogue.sql'), 'utf8'));
    assert.fail('Le rollback devait refuser les données.');
  } catch (error) {
    assert.equal(error.code, 'P0001');
    // Le script multi-instructions a laissé la transaction annulée ouverte.
    await db.query('ROLLBACK');
  }
  record(`rollback protégé : ${name}`);
}

try {
  const pwfile = path.join(run, 'init-password.txt');
  writeFileSync(pwfile, password, { flag: 'wx', mode: 0o600 });
  command(path.join(bin, 'initdb.exe'), ['-D', data, '-U', role,
    '--auth-host=scram-sha-256', '--auth-local=scram-sha-256',
    `--pwfile=${pwfile}`, '--encoding=UTF8', '--locale=C'], env);
  // Lancement direct : pg_ctl start peut échouer à créer un jeton Windows
  // restreint dans l'environnement d'exécution. Aucun privilège n'est modifié.
  const serverLog = openSync(path.join(run, 'postgres.log'), 'a');
  postgres = spawn(path.join(bin, 'postgres.exe'), ['-D', data, '-h', '127.0.0.1', '-p', String(port)],
    { env, stdio: ['ignore', serverLog, serverLog], windowsHide: true });
  closeSync(serverLog);
  let launchError;
  postgres.on('error', error => { launchError = error; });
  started = true;

  // Vérification du cluster neuf AVANT CREATE DATABASE.
  const adminUrl = new URL(connectionString);
  adminUrl.pathname = '/postgres';
  let admin;
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = new Client({ connectionString: adminUrl.href, connectionTimeoutMillis: 1000 });
    try { await candidate.connect(); admin = candidate; break; }
    catch { await candidate.end().catch(() => {}); }
    if (launchError || postgres.exitCode !== null) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!admin) {
    const error = new Error('Démarrage PostgreSQL impossible.');
    error.safeDetail = `postgres.exe : démarrage impossible (code ${postgres.exitCode ?? launchError?.code ?? 'inconnu'}).`;
    throw error;
  }
  try {
    await destination(admin, 'postgres');
    assert.equal((await admin.query('SELECT 1 FROM pg_database WHERE datname=$1', [database])).rowCount, 0);
    await admin.query(`CREATE DATABASE "${database}"`);
  } finally { await admin.end(); }

  db = new Client({ connectionString, connectionTimeoutMillis: 5000 });
  await db.connect();
  await destination(db);
  record('destination isolée vérifiée : cluster neuf, boucle locale, port et base dédiés');
  writeFileSync(path.join(run, '.env.test'), `CMH_CATALOGUE_TEST_DATABASE_URL=${connectionString}\n`, { flag: 'wx', mode: 0o600 });

  const schema = readFileSync(path.join(backend, 'prisma/schema.prisma'), 'utf8')
    .replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = "./client"');
  writeFileSync(path.join(run, 'schema.prisma'), schema, { flag: 'wx' });
  writeFileSync(config, `import { defineConfig, env } from 'prisma/config';
export default defineConfig({
  schema: ${JSON.stringify(path.join(run, 'schema.prisma'))},
  migrations: { path: ${JSON.stringify(path.join(backend, 'prisma/migrations'))} },
  datasource: { url: env('CMH_CATALOGUE_TEST_DATABASE_URL') }
});\n`, { flag: 'wx' });
  prismaCommand('validate');
  record('validation statique du schéma Prisma avec configuration distincte');

  await sql(readFileSync(path.join(backend, 'prisma/migrations/20261022174525_creation_formations/migration.sql'), 'utf8'));
  await destination(db);
  prismaCommand('migrate', 'resolve', '--applied', '20261022174525_creation_formations');
  // Fiches historiques fictives : même structure que la base actuelle.
  await sql(`INSERT INTO "Formation" (id, titre, description, publiee, "createdAt", "updatedAt") VALUES
    ('ancien-public', 'Ancienne publiée', 'Description historique', true, '2026-01-01', '2026-01-02'),
    ('ancien-brouillon', 'Ancien brouillon', '', false, '2026-01-01', '2026-01-02')`);
  const historical = (await sql('SELECT * FROM "Formation" ORDER BY id')).rows;
  await destination(db);
  prismaCommand('migrate', 'deploy');
  const six = 'id, titre, description, publiee, "createdAt", "updatedAt"';
  assert.deepEqual((await sql(`SELECT ${six} FROM "Formation" ORDER BY id`)).rows, historical);
  const defaults = (await sql('SELECT slug, "poleId", tarif, "dureeMinutes", format, resume, devise, "parcoursDocumentaire" FROM "Formation"')).rows;
  for (const row of defaults) assert.deepEqual(row, { slug: null, poleId: null, tarif: null, dureeMinutes: null, format: null, resume: '', devise: 'EUR', parcoursDocumentaire: false });
  record('migration SQL réelle via Prisma Migrate et conservation de deux formations historiques fictives');

  await destination(db);
  prismaCommand('generate');
  const { PrismaClient } = await import(pathToFileURL(path.join(run, 'client/index.js')).href);
  prisma = new PrismaClient({ adapter: createPrismaAdapter(connectionString) });
  await destination(db);
  const pole = await prisma.pole.create({ data: { titre: 'Pôle fictif', slug: 'pole-fictif' } });
  const trainers = await Promise.all(['Alice fictive', 'Bob fictif'].map(nom => prisma.formateur.create({ data: { nom } })));
  const formation = await prisma.formation.create({ data: {
    titre: 'Formation fictive', slug: 'formation-fictive', description: 'Présentation publique fictive',
    publiee: true, poleId: pole.id, dureeMinutes: 840, format: 'WEBINAIRE',
    tarif: '1234.56', parcoursDocumentaire: true,
    formateurs: { create: trainers.map(t => ({ formateurId: t.id })) },
  } });
  const session = await prisma.session.create({ data: { formationId: formation.id, capacite: 12,
    modalitesPratiques: 'Ordinateur requis', fuseauHoraire: 'Europe/Paris' } });
  const secondSession = await prisma.session.create({ data: { formationId: formation.id, lieu: 'Lieu fictif' } });
  const sessions = [session, secondSession];
  const seances = [];
  for (const day of ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23']) {
    seances.push(await prisma.seance.create({ data: { sessionId: session.id,
      debut: new Date(`${day}T09:00:00+01:00`), fin: new Date(`${day}T12:30:00+01:00`) } }));
  }
  const privateLink = 'https://visio.invalid/acces-confidentiel-fictif?token=secret-fictif';
  const access = await prisma.sessionAccesPrive.create({ data: { sessionId: session.id, lienVisioconference: privateLink } });
  for (const entity of [pole, ...trainers, formation, ...sessions, ...seances]) {
    assert.equal(typeof entity.id, 'string');
    assert(entity.id.length > 0);
    assert(entity.updatedAt instanceof Date);
  }
  assert(access.updatedAt instanceof Date);
  assert.equal((await prisma.formation.findUnique({ where: { id: formation.id } })).tarif.toFixed(2), '1234.56');
  assert.equal((await sql('SELECT sum(extract(epoch FROM (fin-debut))/60)::int AS minutes FROM "Seance"')).rows[0].minutes, 840);
  assert.equal((await sql('SELECT debut FROM "Seance" WHERE id=$1', [seances[0].id])).rows[0].debut.toISOString(), '2026-11-02T08:00:00.000Z');
  record('créations Prisma réelles : identifiants TEXT/cuid, relations, deux sessions et quatre séances, Decimal exact');

  // @updatedAt est un mécanisme Prisma, jamais un trigger SQL implicite.
  for (const [delegate, where, dataUpdate] of [
    ['pole', { id: pole.id }, { description: 'Mise à jour fictive' }],
    ['formateur', { id: trainers[0].id }, { biographie: 'Biographie fictive' }],
    ['formation', { id: formation.id }, { resume: 'Résumé fictif' }],
    ['session', { id: session.id }, { lieu: 'Lieu fictif' }],
    ['seance', { id: seances[0].id }, { fin: new Date('2026-11-02T13:00:00+01:00') }],
    ['sessionAccesPrive', { sessionId: session.id }, { lienVisioconference: `${privateLink}&version=2` }],
  ]) {
    await destination(db);
    await prisma[delegate].update({ where, data: { updatedAt: new Date('2000-01-01T00:00:00Z') } });
    const updated = await prisma[delegate].update({ where, data: dataUpdate });
    assert(updated.updatedAt.getTime() > Date.parse('2000-01-01T00:00:00Z'));
  }
  await rejected('SQL brut sans id', 'INSERT INTO "Pole" (titre, slug, "updatedAt") VALUES ($1,$2,now())', ['Fictif', 'sans-id'], '23502');
  await rejected('SQL brut sans updatedAt', 'INSERT INTO "Pole" (id, titre, slug) VALUES ($1,$2,$3)', ['sans-date', 'Fictif', 'sans-date'], '23502');
  const beforeRawUpdate = (await sql('SELECT "updatedAt" FROM "Formation" WHERE id=$1', [formation.id])).rows[0].updatedAt;
  await sql('UPDATE "Formation" SET resume=$1 WHERE id=$2', ['Modification SQL fictive', formation.id]);
  assert.deepEqual((await sql('SELECT "updatedAt" FROM "Formation" WHERE id=$1', [formation.id])).rows[0].updatedAt, beforeRawUpdate);
  record('updatedAt : automatique via Prisma sur six modèles, explicitement requis/non actualisé en SQL brut');

  await rejected('slug de pôle dupliqué', 'INSERT INTO "Pole" (id,titre,slug,"updatedAt") VALUES ($1,$2,$3,now())', ['duplicate-pole','Fictif',pole.slug], '23505');
  await rejected('slug de formation dupliqué', 'UPDATE "Formation" SET slug=$1 WHERE id=$2', [formation.slug, 'ancien-brouillon'], '23505');
  await rejected('association formateur dupliquée', 'INSERT INTO "FormationFormateur" VALUES ($1,$2)', [formation.id,trainers[0].id], '23505');
  await rejected('second accès privé pour la même session', 'INSERT INTO "SessionAccesPrive" ("sessionId","lienVisioconference","updatedAt") VALUES ($1,$2,now())', [session.id,privateLink], '23505');
  await rejected('slug mal formé', 'UPDATE "Formation" SET slug=$1 WHERE id=$2', ['SLUG invalide',formation.id], '23514');
  for (const value of ['-0.01','NaN']) await rejected(`tarif ${value}`, 'UPDATE "Formation" SET tarif=$1 WHERE id=$2', [value,formation.id], '23514');
  for (const value of [0,-1]) {
    await rejected(`durée ${value}`, 'UPDATE "Formation" SET "dureeMinutes"=$1 WHERE id=$2', [value,formation.id], '23514');
    await rejected(`capacité ${value}`, 'UPDATE "Session" SET capacite=$1 WHERE id=$2', [value,session.id], '23514');
  }
  await rejected('devise invalide', 'UPDATE "Formation" SET devise=$1 WHERE id=$2', ['eur',formation.id], '23514');
  await rejected('format inconnu', 'UPDATE "Formation" SET format=$1 WHERE id=$2', ['INCONNU',formation.id], '22P02');
  for (const fin of ['2026-11-02T09:00:00+01:00','2026-11-02T08:00:00+01:00','infinity']) {
    await rejected(`fin de séance invalide ${fin}`, 'UPDATE "Seance" SET fin=$1 WHERE id=$2', [fin,seances[0].id], '23514');
  }
  await rejected('fuseau vide', 'UPDATE "Session" SET "fuseauHoraire"=$1 WHERE id=$2', [' ',session.id], '23514');
  await rejected('lien privé vide', 'UPDATE "SessionAccesPrive" SET "lienVisioconference"=$1 WHERE "sessionId"=$2', [' ',session.id], '23514');
  await sql('UPDATE "Formation" SET tarif=0, "dureeMinutes"=NULL WHERE id=$1', ['ancien-brouillon']);
  await sql('UPDATE "Session" SET capacite=NULL WHERE id=$1', [secondSession.id]);
  record('valeurs optionnelles NULL et tarif gratuit acceptés');

  for (const [name, query, params] of [
    ['formation vers pôle','UPDATE "Formation" SET "poleId"=$1 WHERE id=$2',['absent',formation.id]],
    ['session vers formation','UPDATE "Session" SET "formationId"=$1 WHERE id=$2',['absent',session.id]],
    ['séance vers session','UPDATE "Seance" SET "sessionId"=$1 WHERE id=$2',['absent',seances[0].id]],
    ['liaison vers formation','INSERT INTO "FormationFormateur" VALUES ($1,$2)',['absent',trainers[0].id]],
    ['liaison vers formateur','INSERT INTO "FormationFormateur" VALUES ($1,$2)',[formation.id,'absent']],
    ['accès privé vers session','INSERT INTO "SessionAccesPrive" ("sessionId","lienVisioconference","updatedAt") VALUES ($1,$2,now())',['absent',privateLink]],
  ]) await rejected(`clé étrangère ${name}`, query, params, '23503');
  await rejected('suppression pôle utilisé', 'DELETE FROM "Pole" WHERE id=$1', [pole.id], '23001');
  await rejected('suppression formation avec sessions', 'DELETE FROM "Formation" WHERE id=$1', [formation.id], '23001');
  await rejected('suppression session avec séances', 'DELETE FROM "Session" WHERE id=$1', [session.id], '23001');
  assert.equal((await sql('SELECT count(*)::int AS n FROM "FormationFormateur"')).rows[0].n, 2);
  record('suppressions RESTRICT atomiques : associations conservées après refus');

  // Les seules cascades de suppression autorisées sont vérifiées en transaction annulée.
  await sql('BEGIN');
  await sql('DELETE FROM "Formateur" WHERE id=$1', [trainers[0].id]);
  assert.equal((await sql('SELECT count(*)::int AS n FROM "FormationFormateur"')).rows[0].n, 1);
  assert.equal((await sql('SELECT count(*)::int AS n FROM "Formation" WHERE id=$1', [formation.id])).rows[0].n, 1);
  await sql('ROLLBACK');
  await sql('BEGIN');
  await sql('DELETE FROM "Seance" WHERE "sessionId"=$1', [session.id]);
  await sql('DELETE FROM "Session" WHERE id=$1', [session.id]);
  assert.equal((await sql('SELECT count(*)::int AS n FROM "SessionAccesPrive"')).rows[0].n, 0);
  assert.equal((await sql('SELECT count(*)::int AS n FROM "Formation" WHERE id=$1', [formation.id])).rows[0].n, 1);
  await sql('ROLLBACK');
  await sql('BEGIN');
  await sql('DELETE FROM "SessionAccesPrive"');
  await sql('DELETE FROM "Seance"');
  await sql('DELETE FROM "Session"');
  await sql('DELETE FROM "Formation" WHERE id=$1', [formation.id]);
  assert.equal((await sql('SELECT count(*)::int AS n FROM "FormationFormateur"')).rows[0].n, 0);
  assert.equal((await sql('SELECT count(*)::int AS n FROM "Formateur"')).rows[0].n, 2);
  await sql('ROLLBACK');
  record('cascades limitées aux liaisons et accès privés, sans suppression indirecte des entités métier');

  // Changement d'heure : même heure locale, deux instants différents.
  await sql('BEGIN');
  await sql(`INSERT INTO "Seance" (id,"sessionId",debut,fin,"updatedAt") VALUES
    ('seance-dst',$1,'2026-10-25T02:30:00+02:00','2026-10-25T02:30:00+01:00',now())`, [session.id]);
  const dst = (await sql(`SELECT extract(epoch FROM (fin-debut))/60 AS minutes,
    debut AT TIME ZONE 'Europe/Paris' = fin AT TIME ZONE 'Europe/Paris' AS meme_heure_locale
    FROM "Seance" WHERE id='seance-dst'`)).rows[0];
  assert.equal(Number(dst.minutes), 60);
  assert.equal(dst.meme_heure_locale, true);
  await sql('ROLLBACK');
  record('TIMESTAMPTZ et offsets explicites : changement d’heure Europe/Paris, durée réelle de 60 minutes');

  await destination(db);
  const prismaDst = await prisma.seance.create({ data: { sessionId: secondSession.id,
    debut: new Date('2026-10-25T02:30:00+02:00'), fin: new Date('2026-10-25T02:30:00+01:00') } });
  assert.equal(prismaDst.debut.toISOString(), '2026-10-25T00:30:00.000Z');
  assert.equal(prismaDst.fin.toISOString(), '2026-10-25T01:30:00.000Z');
  assert.equal(Number((await sql('SELECT extract(epoch FROM (fin-debut))/60 AS minutes FROM "Seance" WHERE id=$1', [prismaDst.id])).rows[0].minutes), 60);
  await destination(db);
  await prisma.seance.delete({ where: { id: prismaDst.id } });
  const prismaZone = await prisma.$queryRaw`SELECT current_setting('TimeZone') AS zone`;
  assert.equal(prismaZone[0].zone, 'UTC');
  record('adaptateur applicatif réel : connexions UTC, instants et durée corrects via Prisma au changement d’heure');

  const indexes = (await sql(`SELECT indexname FROM pg_indexes WHERE schemaname='public'`)).rows.map(r => r.indexname);
  for (const name of ['Formation_poleId_idx','FormationFormateur_pkey','FormationFormateur_formateurId_idx','Session_formationId_idx','Seance_sessionId_debut_idx','SessionAccesPrive_pkey']) assert(indexes.includes(name));
  record('index réels présents pour toutes les clés étrangères, dont les préfixes de clés composées');

  // Vrai serveur Express existant, avec DATABASE_URL remplacée uniquement dans son processus.
  for (const clientVersion of ['actuel', 'cible généré séparément']) {
    const apiPort = await freePort();
    await destination(db);
    // Rediriger seulement l'import du client dans CE processus enfant, afin de
    // tester le client cible sans remplacer node_modules/.prisma/client.
    const apiArgs = clientVersion === 'actuel' ? ['server.js'] : ['--input-type=module', '-e', `
      import { registerHooks } from 'node:module';
      import { pathToFileURL } from 'node:url';
      registerHooks({ resolve(specifier, context, nextResolve) {
        if (specifier === '@prisma/client') return { url: pathToFileURL(process.env.CMH_CATALOGUE_TEST_CLIENT_PATH).href, shortCircuit: true };
        return nextResolve(specifier, context);
      }});
      await import('./server.js');
    `];
    api = spawn(process.execPath, apiArgs, { cwd: backend,
      env: { ...env, DATABASE_URL: connectionString, PORT: String(apiPort),
        CMH_CATALOGUE_TEST_CLIENT_PATH: path.join(run, 'client/index.js') },
      stdio: 'ignore', windowsHide: true });
    let response;
    for (let attempt = 0; attempt < 50; attempt++) {
      try { response = await fetch(`http://127.0.0.1:${apiPort}/api/formations`); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.equal(response?.status, 200);
    const publicBody = await response.json();
    const expected = (await sql('SELECT id,titre,description FROM "Formation" WHERE publiee=true ORDER BY titre,id')).rows;
    assert.equal(expected.length, 2);
    assert.deepEqual(publicBody, { formations: expected });
    assert(!JSON.stringify(publicBody).includes('confidentiel'));
    assert(!JSON.stringify(publicBody).includes('secret-fictif'));
    for (const f of publicBody.formations) assert.deepEqual(Object.keys(f).sort(), ['description','id','titre']);
    record(`vrai GET /api/formations, client ${clientVersion} : publiées uniquement, contrat exact à trois champs, aucun accès privé`);
    const child = api;
    const exited = new Promise(resolve => child.once('exit', resolve));
    child.kill();
    await exited;
    api = undefined;
  }
  await prisma.$disconnect();
  prisma = undefined;

  await rollbackRejected('nouvelles tables et colonnes renseignées');
  assert.equal((await sql('SELECT count(*)::int AS n FROM "Seance"')).rows[0].n, 4);
  // Nettoyage uniquement des données fictives de CETTE base nouvellement créée.
  await sql('DELETE FROM "SessionAccesPrive"');
  await sql('DELETE FROM "Seance"');
  await sql('DELETE FROM "Session"');
  await sql('DELETE FROM "FormationFormateur"');
  await sql('DELETE FROM "Formateur"');
  await sql('UPDATE "Formation" SET "poleId"=NULL');
  await sql('DELETE FROM "Pole"');
  await rollbackRejected('tables nouvelles vides, mais nouvelle colonne de Formation renseignée');
  await sql('DELETE FROM "Formation" WHERE id=$1', [formation.id]);
  await sql('UPDATE "Formation" SET tarif=NULL WHERE id=$1', ['ancien-brouillon']);
  await sql(readFileSync(path.join(backend, 'prisma/rollbacks/20261109210000_presences_manuelles.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/rollbacks/20261109200000_questionnaires.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/rollbacks/20261109190000_espace_stagiaire.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/rollbacks/20261109180000_pieces_jointes.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/rollbacks/20261109150000_dossiers_administratifs.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/rollbacks/20261106120000_preinscriptions.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/rollbacks/20261024150000_catalogue.sql'), 'utf8'));
  assert.deepEqual((await sql(`SELECT ${six} FROM "Formation" ORDER BY id`)).rows, historical);
  assert.equal((await sql(`SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND table_name='Formation'`)).rows[0].n, 6);
  assert.equal((await sql(`SELECT count(*)::int AS n FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='FormatFormation'`)).rows[0].n, 0);
  record('rollback SQL réel réussi après remise en état, six colonnes et données historiques préservées');

  // Essai DDL de réapplication directe. L’historique Prisma de la base jetable
  // n’est pas modifié : voir la limite documentée sur le rollback manuel.
  await sql(readFileSync(path.join(backend, 'prisma/migrations/20261024150000_catalogue/migration.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/migrations/20261025100000_consignes_sessions/migration.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/migrations/20261025160000_visibilite_sessions/migration.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/migrations/20261106120000_preinscriptions/migration.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/migrations/20261109150000_dossiers_administratifs/migration.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/migrations/20261109180000_pieces_jointes/migration.sql'), 'utf8'));
  assert.deepEqual((await sql(`SELECT ${six} FROM "Formation" ORDER BY id`)).rows, historical);
  assert.equal((await sql(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('Pole','Formateur','FormationFormateur','Session','Seance','SessionAccesPrive')`)).rows[0].n, 6);
  await sql(readFileSync(path.join(backend, 'prisma/migrations/20261109190000_espace_stagiaire/migration.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/migrations/20261109200000_questionnaires/migration.sql'), 'utf8'));
  await sql(readFileSync(path.join(backend, 'prisma/migrations/20261109210000_presences_manuelles/migration.sql'), 'utf8'));
  record('réapplication SQL réelle réussie après rollback, données historiques toujours préservées');
} catch (error) {
  // Message d’assertion sélectionné uniquement, sans valeurs SQL ou secrets.
  console.error(`FAIL ${error.code || error.name || 'test'} : essai interrompu ; détails confidentiels masqués.`);
  if (error.safeDetail) console.error(error.safeDetail);
  if (error.code === 'ERR_ASSERTION') console.error(error.message.replaceAll(connectionString, '[URL masquée]').replaceAll(password, '[secret masqué]'));
  log.push(`ECHEC ${error.code || error.name || 'test'}`);
  process.exitCode = 1;
} finally {
  api?.kill();
  if (prisma) await prisma.$disconnect().catch(() => {});
  if (db) await db.end().catch(() => {});
  if (started) {
    try {
      if (postgres?.exitCode !== null) throw new Error('Serveur déjà arrêté.');
      command(path.join(bin, 'pg_ctl.exe'), ['-D', data, '-m', 'fast', '-w', 'stop'], env);
      record('instance de test arrêtée ; aucune base préexistante supprimée');
    } catch { console.error('Arrêt du cluster de test à vérifier.'); process.exitCode = 1; }
  }
  writeFileSync(path.join(run, 'resultats.json'), JSON.stringify({ database, port, run,
    success: !process.exitCode, tests: log }, null, 2));
  console.log(`Résultats sans secret : ${path.join(run, 'resultats.json')}`);
}
