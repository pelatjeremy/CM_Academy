import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {isolatedDb,backend} from './lib/isolated-db.mjs';
let db;const results=[];const pass=s=>{results.push(s);console.log(`PASS ${s}`);};
try {
  db=await isolatedDb();await db.guard();
  for(const name of ['20261022174525_creation_formations','20261024150000_catalogue','20261024180000_authentification'])await db.sql(readFileSync(path.join(backend,'prisma/migrations',name,'migration.sql'),'utf8'));
  await db.sql(`INSERT INTO "Formation" (id,titre,"updatedAt") VALUES ('formation-schema','Historique',now()); INSERT INTO "Session" (id,"formationId","updatedAt") VALUES ('session-schema','formation-schema',now()); INSERT INTO "SessionAccesPrive" ("sessionId","lienVisioconference","updatedAt") VALUES ('session-schema','https://visio.invalid/historique',now())`);
  const up=readFileSync(path.join(backend,'prisma/migrations/20261025100000_consignes_sessions/migration.sql'),'utf8'),down=readFileSync(path.join(backend,'prisma/rollbacks/20261025100000_consignes_sessions.sql'),'utf8');
  await db.sql(up);let row=(await db.sql('SELECT * FROM "SessionAccesPrive"')).rows[0];assert.equal(row.consignes,'');assert.equal(row.lienVisioconference,'https://visio.invalid/historique');pass('migration réelle : ancien lien préservé, consignes vides par défaut');
  for(const query of [`UPDATE "SessionAccesPrive" SET consignes='Instruction privée'`,`UPDATE "SessionAccesPrive" SET consignes='',"lienVisioconference"=NULL`]) {
    await db.sql(query);await assert.rejects(()=>db.sql(down),e=>e.code==='P0001');await db.rollback();pass('rollback refuse la perte des nouvelles informations privées');
  }
  await db.sql(`UPDATE "SessionAccesPrive" SET consignes='',"lienVisioconference"='https://visio.invalid/historique'`);await db.sql(down);assert(!Object.hasOwn((await db.sql('SELECT * FROM "SessionAccesPrive"')).rows[0],'consignes'));await db.sql(up);pass('rollback puis réapplication réels après remise en état compatible ; lignes conservées');
}catch(e){console.error(`FAIL ${e.code||e.name} (détails masqués)`);process.exitCode=1;}finally{if(db){await db.close();writeFileSync(path.join(db.run,'sessions-schema-results.json'),JSON.stringify({success:!process.exitCode,results},null,2));console.log(`Résultats : ${db.run}`);}}
