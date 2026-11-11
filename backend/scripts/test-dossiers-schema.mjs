import assert from 'node:assert/strict';
import {readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {isolatedDb, backend} from './lib/isolated-db.mjs';

const target = '20261109150000_dossiers_administratifs';
let db;
const results = [];
const pass = message => {results.push(message);console.log('PASS ' + message);};
try {
  db = await isolatedDb();
  await db.guard();
  const directory = path.join(backend, 'prisma/migrations');
  for (const name of readdirSync(directory).filter(name => name !== 'migration_lock.toml' && name < target).sort()) {
    await db.sql(readFileSync(path.join(directory, name, 'migration.sql'), 'utf8'));
  }
  await db.sql(`INSERT INTO "Formation" (id,titre,"parcoursDocumentaire","updatedAt") VALUES ('f','Formation ancienne',true,now()),('f-off','Formation sans parcours',false,now());
    INSERT INTO "Session" (id,"formationId","updatedAt") VALUES ('s','f',now()),('s-off','f-off',now());`);
  for (const [index, statut] of ['EN_ATTENTE', 'CONFIRMEE', 'REFUSEE', 'ANNULEE'].entries()) {
    await db.sql('INSERT INTO "Inscription" (id,"sessionId",prenom,nom,email,"typeDemande",statut) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      ['i-' + index, 's', 'Prénom', 'Ancien', index + '@test.invalid', 'PARTICULIER', statut]);
  }
  await db.sql(`INSERT INTO "Inscription" (id,"sessionId",prenom,nom,email,"typeDemande") VALUES ('i-off','s-off','Prénom','Sans parcours','off@test.invalid','PARTICULIER')`);
  const before = (await db.sql('SELECT * FROM "Inscription" ORDER BY id')).rows;
  const migration = readFileSync(path.join(directory, target, 'migration.sql'), 'utf8');
  await db.sql(migration);
  for (const name of readdirSync(directory).filter(name => name !== 'migration_lock.toml' && name > target).sort()) {
    await db.sql(readFileSync(path.join(directory, name, 'migration.sql'), 'utf8'));
  }
  const config = path.join(db.run, 'dossiers.config.ts');
  writeFileSync(config, `import {defineConfig,env} from 'prisma/config'; export default defineConfig({schema:${JSON.stringify(path.join(backend, 'prisma/schema.prisma'))},datasource:{url:env('CMH_DOSSIER_TEST_URL')}});`);
  db.command(process.execPath, [path.join(backend, 'node_modules/prisma/build/index.js'),
    'migrate', 'diff', '--from-config-datasource', '--to-schema', path.join(backend, 'prisma/schema.prisma'),
    '--exit-code', '--config', config], {CMH_DOSSIER_TEST_URL: db.connectionString});
  pass('cohérence réelle entre le schéma PostgreSQL migré et le modèle Prisma');
  assert.deepEqual((await db.sql('SELECT * FROM "Inscription" ORDER BY id')).rows, before);
  assert.equal((await db.sql('SELECT count(*)::int AS n FROM "DossierAdministratif"')).rows[0].n, 5);
  assert.equal((await db.sql('SELECT count(*)::int AS n FROM "ElementDocumentaire"')).rows[0].n, 40);
  assert.equal((await db.sql('SELECT count(*)::int AS n FROM "ChangementDocumentaire"')).rows[0].n, 0);
  pass('migration SQL réelle : cinq inscriptions existantes conservées, tous les statuts, quarante éléments et dossier désactivé');

  await db.sql(`UPDATE "ElementDocumentaire" SET etat='RECU', note='Note conservée' WHERE "inscriptionId"='i-0' AND categorie='PROGRAMME';
    UPDATE "Formation" SET "parcoursDocumentaire"=NOT "parcoursDocumentaire";`);
  const initialiserSql = migration.slice(migration.indexOf('-- Configuration figée'));
  const dossierBefore = (await db.sql('SELECT * FROM "DossierAdministratif" ORDER BY "inscriptionId"')).rows;
  const elementsBefore = (await db.sql('SELECT * FROM "ElementDocumentaire" ORDER BY "inscriptionId",categorie')).rows;
  await db.sql('BEGIN; ' + initialiserSql);
  await db.sql('BEGIN; ' + initialiserSql);
  assert.deepEqual((await db.sql('SELECT * FROM "DossierAdministratif" ORDER BY "inscriptionId"')).rows, dossierBefore);
  assert.deepEqual((await db.sql('SELECT * FROM "ElementDocumentaire" ORDER BY "inscriptionId",categorie')).rows, elementsBefore);
  pass('réinitialisation SQL idempotente : configurations figées et états/notes existants conservés');

  for (const [sql, code] of [
    [`INSERT INTO "DossierAdministratif" ("inscriptionId","parcoursDocumentaire","updatedAt") VALUES ('i-0',false,now())`, '23505'],
    [`UPDATE "ElementDocumentaire" SET note=repeat('x',501)`, '22001'],
    [`UPDATE "ElementDocumentaire" SET etat='SIGNE'`, '22P02'],
    [`DELETE FROM "Inscription" WHERE id='i-0'`, '23001'],
  ]) await assert.rejects(() => db.sql(sql), error => error.code === code);
 await db.sql(readFileSync(path.join(backend,'prisma/rollbacks/20261109210000_presences_manuelles.sql'),'utf8'));
 await db.sql(readFileSync(path.join(backend,'prisma/rollbacks/20261109200000_questionnaires.sql'),'utf8'));
  await db.sql(readFileSync(path.join(backend,'prisma/rollbacks/20261109190000_espace_stagiaire.sql'),'utf8'));
  const down = readFileSync(path.join(backend, 'prisma/rollbacks', target + '.sql'), 'utf8');
  await assert.rejects(() => db.sql(down), error => error.code === 'P0001');
  await db.rollback();
  pass('contraintes SQL : unicité, longueur des notes, états autorisés, suppression restreinte et rollback protégé');
} catch (error) {
  console.error('FAIL ' + (error.code || error.name) + ' (détails masqués)');
  console.error(error.stack?.split('\n').find(line => line.includes('test-dossiers-schema.mjs:')) || '');
  process.exitCode = 1;
} finally {
  if (db) {
    await db.close();
    writeFileSync(path.join(db.run, 'dossiers-schema-results.json'), JSON.stringify({success: !process.exitCode, results}, null, 2));
    console.log('Résultats : ' + db.run);
  }
}
