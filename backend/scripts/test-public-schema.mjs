import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {isolatedDb,backend} from './lib/isolated-db.mjs';
let db;const results=[];const pass=s=>{results.push(s);console.log(`PASS ${s}`);};
try{
  db=await isolatedDb();await db.guard();
  for(const name of ['20261022174525_creation_formations','20261024150000_catalogue','20261024180000_authentification','20261025100000_consignes_sessions'])await db.sql(readFileSync(path.join(backend,'prisma/migrations',name,'migration.sql'),'utf8'));
  await db.sql(`INSERT INTO "Formation" (id,titre,"updatedAt") VALUES ('formation-public-schema','Historique',now()); INSERT INTO "Session" (id,"formationId","updatedAt") VALUES ('session-public-schema','formation-public-schema',now())`);
  const original=(await db.sql('SELECT * FROM "Session"')).rows[0];
  const up=readFileSync(path.join(backend,'prisma/migrations/20261025160000_visibilite_sessions/migration.sql'),'utf8'),down=readFileSync(path.join(backend,'prisma/rollbacks/20261025160000_visibilite_sessions.sql'),'utf8');
  await db.sql(up);const after=(await db.sql('SELECT * FROM "Session"')).rows[0];assert.equal(after.visiblePubliquement,false);delete after.visiblePubliquement;assert.deepEqual(after,original);pass('migration : session historique conservée, masquée par défaut');
  await assert.rejects(()=>db.sql('UPDATE "Session" SET "visiblePubliquement"=NULL'),e=>e.code==='23502');
  await db.sql('UPDATE "Session" SET "visiblePubliquement"=true');await assert.rejects(()=>db.sql(down),e=>e.code==='P0001');await db.rollback();assert.equal((await db.sql('SELECT "visiblePubliquement" FROM "Session"')).rows[0].visiblePubliquement,true);pass('NOT NULL et rollback protégé : choix de visibilité non perdu');
  await db.sql('UPDATE "Session" SET "visiblePubliquement"=false');await db.sql(down);assert.deepEqual((await db.sql('SELECT * FROM "Session"')).rows[0],original);await db.sql(up);assert.equal((await db.sql('SELECT "visiblePubliquement" FROM "Session"')).rows[0].visiblePubliquement,false);pass('rollback compatible puis réapplication réels, sans perte des données historiques');
}catch(e){console.error(`FAIL ${e.code||e.name} (détails masqués)`);process.exitCode=1;}finally{if(db){await db.close();writeFileSync(path.join(db.run,'public-schema-results.json'),JSON.stringify({success:!process.exitCode,results},null,2));console.log(`Résultats : ${db.run}`);}}
