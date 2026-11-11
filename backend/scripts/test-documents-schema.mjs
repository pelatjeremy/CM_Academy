import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {isolatedDb,backend} from './lib/isolated-db.mjs';

const target='20261109180000_pieces_jointes';
const results=[];
let db;
const pass=message=>{results.push(message);console.log('PASS '+message);};
try{
  db=await isolatedDb();await db.guard();
  const directory=path.join(backend,'prisma/migrations');
  for(const name of readdirSync(directory).filter(name=>name!=='migration_lock.toml'&&name<target).sort()){
    await db.sql(readFileSync(path.join(directory,name,'migration.sql'),'utf8'));
  }
  await db.sql(`INSERT INTO "Formation" (id,titre,"updatedAt") VALUES ('f','Formation ancienne',now());
    INSERT INTO "Session" (id,"formationId","updatedAt") VALUES ('s','f',now());
    INSERT INTO "Inscription" (id,"sessionId",prenom,nom,email,"typeDemande") VALUES ('i','s','Prénom','Nom','test@example.invalid','PARTICULIER');
    INSERT INTO "DossierAdministratif" ("inscriptionId","parcoursDocumentaire","updatedAt") VALUES ('i',true,now());
    INSERT INTO "ElementDocumentaire" ("inscriptionId",categorie,etat,note) VALUES ('i','PROGRAMME','RECU','Note antérieure');
    INSERT INTO "Utilisateur" (id,email,"motDePasseHash",role,"updatedAt") VALUES ('u','admin@example.invalid','test-sql','ADMIN',now());`);
  const before=(await db.sql('SELECT * FROM "ElementDocumentaire"')).rows[0];
  await db.sql(readFileSync(path.join(directory,target,'migration.sql'),'utf8'));
  const after=(await db.sql('SELECT * FROM "ElementDocumentaire"')).rows[0];
  assert.equal(after.fichierRevision,0);delete after.fichierRevision;assert.deepEqual(after,before);
  assert.equal((await db.sql('SELECT count(*)::int AS n FROM "PieceJointe"')).rows[0].n,0);
  await db.sql(readFileSync(path.join(directory,'20261109190000_espace_stagiaire','migration.sql'),'utf8'));
  await db.sql(readFileSync(path.join(directory,'20261109200000_questionnaires','migration.sql'),'utf8'));
 await db.sql(readFileSync(path.join(directory,'20261109210000_presences_manuelles','migration.sql'),'utf8'));
 const config=path.join(db.run,'documents.config.ts');
  writeFileSync(config,`import {defineConfig,env} from 'prisma/config';export default defineConfig({schema:${JSON.stringify(path.join(backend,'prisma/schema.prisma'))},datasource:{url:env('DOCUMENT_TEST_URL')}});`);
  db.command(process.execPath,[path.join(backend,'node_modules/prisma/build/index.js'),'migrate','diff','--from-config-datasource','--to-schema',path.join(backend,'prisma/schema.prisma'),'--exit-code','--config',config],{DOCUMENT_TEST_URL:db.connectionString});
  pass('migration : état et note existants conservés, révision initiale zéro, aucune divergence Prisma/SQL');

  async function insert(changes={}){
    const row={id:randomUUID(),version:1,depot:randomUUID(),key:randomUUID(),name:'programme.pdf',taille:12,mime:'application/pdf',sha:'a'.repeat(64),...changes};
    return db.sql('INSERT INTO "PieceJointe" (id,"inscriptionId",categorie,version,"depotId","stockageKey","nomOriginal",taille,"typeMime",empreinte,"auteurId") VALUES ($1,\'i\',\'PROGRAMME\',$2,$3,$4,$5,$6,$7,$8,\'u\')',[row.id,row.version,row.depot,row.key,row.name,row.taille,row.mime,row.sha]);
  }
  for(const invalid of[{version:0},{taille:0},{mime:'text/html'},{sha:'invalide'},{name:'ligne\n.pdf'}]){
    await assert.rejects(()=>insert(invalid),error=>error.code==='23514');
  }
  await insert();
  await assert.rejects(()=>insert(),error=>error.code==='23505');
  await assert.rejects(()=>db.sql('DELETE FROM "ElementDocumentaire"'),error=>error.code==='23001');
  await assert.rejects(()=>db.sql('UPDATE "ElementDocumentaire" SET "fichierRevision"=-1'),error=>error.code==='23514');
 await db.sql(readFileSync(path.join(backend,'prisma/rollbacks/20261109210000_presences_manuelles.sql'),'utf8'));
 await db.sql(readFileSync(path.join(backend,'prisma/rollbacks/20261109200000_questionnaires.sql'),'utf8'));
  await db.sql(readFileSync(path.join(backend,'prisma/rollbacks/20261109190000_espace_stagiaire.sql'),'utf8'));
  const rollback=readFileSync(path.join(backend,'prisma/rollbacks',target+'.sql'),'utf8');
  await assert.rejects(()=>db.sql(rollback),error=>error.code==='P0001');await db.rollback();
  pass('contraintes SQL : types, tailles, versions, empreintes, noms, unicité, relations et rollback protégé');

  await db.sql('DELETE FROM "PieceJointe"');
  await db.sql(rollback);
  await db.sql(readFileSync(path.join(directory,target,'migration.sql'),'utf8'));
  assert.equal((await db.sql('SELECT note FROM "ElementDocumentaire"')).rows[0].note,'Note antérieure');
  pass('retour arrière puis réapplication sur base isolée compatible, suivi manuel préservé');
}catch(error){console.error('FAIL '+(error.code||error.name)+' (détails masqués)');console.error(error.stack?.split('\n').find(line=>line.includes('test-documents-schema.mjs:'))||'');process.exitCode=1;}
finally{if(db){await db.close();writeFileSync(path.join(db.run,'documents-schema-results.json'),JSON.stringify({success:!process.exitCode,results},null,2));console.log('Résultats : '+db.run);}}
