import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {isolatedDb,backend} from './lib/isolated-db.mjs';

const target='20261111180000_videos_pedagogiques',results=[];let db;
try {
 db=await isolatedDb();const migrations=path.join(backend,'prisma/migrations');
 for(const name of readdirSync(migrations).filter(n=>n!=='migration_lock.toml'&&n<target).sort())await db.sql(readFileSync(path.join(migrations,name,'migration.sql'),'utf8'));
 await db.sql(`INSERT INTO "Utilisateur" (id,email,"motDePasseHash",role,"updatedAt") VALUES ('admin','admin@videos-sql.invalid','hash-fictif','ADMIN',now());
 INSERT INTO "Formation" (id,titre,"updatedAt") VALUES ('f','Formation conservée',now());
 INSERT INTO "Session" (id,"formationId","updatedAt") VALUES ('s','f',now());
 INSERT INTO "Inscription" (id,"sessionId",prenom,nom,email,"typeDemande",statut) VALUES ('i','s','Alice','Fictif','alice@videos-sql.invalid','PARTICULIER','CONFIRMEE');
 INSERT INTO "ParcoursPedagogique" ("formationId","updatedAt") VALUES ('f',now());
 INSERT INTO "ModulePedagogique" (id,"formationId",titre,ordre,publie,"updatedAt") VALUES ('m','f','Module conservé',0,true,now());
 INSERT INTO "LeconPedagogique" (id,"moduleId",titre,contenu,ordre,publie,"updatedAt") VALUES ('l','m','Leçon conservée','Texte conservé',0,true,now());
 INSERT INTO "ProgressionLecon" ("inscriptionId","leconId",terminee,"termineeAt","updatedAt") VALUES ('i','l',true,now(),now());`);
 const tables=(await db.sql(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows.map(r=>r.tablename);
 async function snapshot(){const result={};for(const name of tables)result[name]=(await db.sql('SELECT to_jsonb(t) AS row FROM "'+name+'" t ORDER BY to_jsonb(t)::text')).rows;return result;}
 const before=await snapshot(),sql=readFileSync(path.join(migrations,target,'migration.sql'),'utf8'),rollback=readFileSync(path.join(backend,'prisma/rollbacks',target+'.sql'),'utf8');
 await db.sql(sql);assert.deepEqual(await snapshot(),before);assert.equal((await db.sql('SELECT count(*)::int AS n FROM "VideoLecon"')).rows[0].n,0);
 const config=path.join(db.run,'videos.config.ts');writeFileSync(config,`import {defineConfig,env} from 'prisma/config';export default defineConfig({schema:${JSON.stringify(path.join(backend,'prisma/schema.prisma'))},datasource:{url:env('VIDEOS_TEST_URL')}});`);
 const diff=()=>db.command(process.execPath,[path.join(backend,'node_modules/prisma/build/index.js'),'migrate','diff','--from-config-datasource','--to-schema',path.join(backend,'prisma/schema.prisma'),'--exit-code','--config',config],{VIDEOS_TEST_URL:db.connectionString});diff();
 results.push('migration sur treize migrations existantes peuplées : toutes les anciennes tables intactes et diff Prisma sans divergence');
 await db.sql(rollback);assert.deepEqual(await snapshot(),before);await db.sql(sql);diff();results.push('retour arrière vide et réapplication sans perte des données existantes');
 const insert=(id,version=1,type='video/mp4',taille=100)=>db.sql(`INSERT INTO "VideoLecon" (id,"leconId",version,"depotId","stockageKey","nomOriginal",taille,"typeMime",empreinte,titre,"dureeSecondes","auteurId") VALUES ($1,'l',$2,$3,$4,'video.mp4',$5,$6,$7,'Vidéo fictive',12,'admin')`,[id,version,randomUUID(),randomUUID(),taille,type,'a'.repeat(64)]);
 await insert('v1');await assert.rejects(()=>insert('double',2),e=>e.code==='23505');
 await assert.rejects(()=>insert('type',3,'application/pdf'),e=>e.code==='23514');await assert.rejects(()=>insert('size',3,'video/mp4',0),e=>e.code==='23514');
 await assert.rejects(()=>db.sql(`UPDATE "VideoLecon" SET titre='Écrasement' WHERE id='v1'`),e=>e.code==='23514');
 await assert.rejects(()=>db.sql(`DELETE FROM "VideoLecon" WHERE id='v1'`),e=>e.code==='23514');
 await db.sql(`UPDATE "VideoLecon" SET "retireAt"=now(),"retireParId"='admin' WHERE id='v1'`);await insert('v2',2);
 await assert.rejects(()=>db.sql(`UPDATE "VideoLecon" SET "retireAt"=NULL,"retireParId"=NULL WHERE id='v1'`),e=>e.code==='23514');
 await assert.rejects(()=>db.sql(`DELETE FROM "LeconPedagogique" WHERE id='l'`));
 results.push('unicité de version active, type/taille, versions immuables et conservation des références contrôlés en SQL réel');
 await assert.rejects(()=>db.sql(rollback),e=>e.code==='P0001');await db.rollback();assert.deepEqual(await snapshot(),before);
 results.push('rollback refusé avec historique vidéo présent, anciennes données et progression inchangées');
 console.log('PASS '+results.join('\nPASS '));
} catch(e){process.exitCode=1;console.error('FAIL SQL vidéos : '+(e.code||e.name));const frame=e.stack?.split('\n').find(l=>l.includes('test-videos-schema.mjs:'));if(frame)console.error(frame);}
finally{if(db){writeFileSync(path.join(db.run,'videos-schema-results.json'),JSON.stringify({success:!process.exitCode,results},null,2));await db.close();console.log('RAPPORT '+path.join(db.run,'videos-schema-results.json'));}}
