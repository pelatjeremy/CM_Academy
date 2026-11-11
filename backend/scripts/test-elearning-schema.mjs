import assert from 'node:assert/strict';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {isolatedDb,backend} from './lib/isolated-db.mjs';
const target='20261111160000_contenu_pedagogique';let db;const results=[];
try{
 db=await isolatedDb();await db.guard();const migrations=path.join(backend,'prisma/migrations');
 for(const name of readdirSync(migrations).filter(n=>n!=='migration_lock.toml'&&n<target).sort())await db.sql(readFileSync(path.join(migrations,name,'migration.sql'),'utf8'));
 await db.sql(`INSERT INTO "Utilisateur" (id,email,"motDePasseHash",role,"updatedAt") VALUES ('a','admin@pedagogie-sql.invalid','hash-fictif','ADMIN',now());
 INSERT INTO "Formation" (id,titre,"updatedAt") VALUES ('f','Formation conservée',now()),('autre','Autre formation',now());
 INSERT INTO "Session" (id,"formationId","updatedAt") VALUES ('s','f',now()),('s2','autre',now());
 INSERT INTO "Inscription" (id,"sessionId",prenom,nom,email,"typeDemande",statut) VALUES ('i','s','Alice','Test','a@pedagogie-sql.invalid','PARTICULIER','CONFIRMEE'),('i2','s2','Bob','Test','b@pedagogie-sql.invalid','PARTICULIER','CONFIRMEE');`);
 async function oldRows(){const data={};for(const name of ['Formation','Session','Inscription','Utilisateur'])data[name]=(await db.sql('SELECT * FROM "'+name+'" ORDER BY id')).rows;return data;}
 const before=await oldRows(),sql=readFileSync(path.join(migrations,target,'migration.sql'),'utf8'),rollback=readFileSync(path.join(backend,'prisma/rollbacks',target+'.sql'),'utf8');await db.sql(sql);assert.deepEqual(await oldRows(),before);
 const config=path.join(db.run,'pedagogie.config.ts');writeFileSync(config,`import {defineConfig,env} from 'prisma/config';export default defineConfig({schema:${JSON.stringify(path.join(backend,'prisma/schema.prisma'))},datasource:{url:env('PEDAGOGIE_TEST_URL')}});`);
 const videos=readFileSync(path.join(migrations,'20261111180000_videos_pedagogiques/migration.sql'),'utf8'),videoRollback=readFileSync(path.join(backend,'prisma/rollbacks/20261111180000_videos_pedagogiques.sql'),'utf8');await db.sql(videos);
 const diff=()=>db.command(process.execPath,[path.join(backend,'node_modules/prisma/build/index.js'),'migrate','diff','--from-config-datasource','--to-schema',path.join(backend,'prisma/schema.prisma'),'--exit-code','--config',config],{PEDAGOGIE_TEST_URL:db.connectionString});diff();
 const fks=(await db.sql(`SELECT count(*)::int AS n FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid WHERE c.contype='f' AND c.confdeltype='r' AND t.relname IN ('ParcoursPedagogique','ModulePedagogique','LeconPedagogique','SupportLecon','ProgressionLecon')`)).rows[0].n;assert.equal(fks,7);
 for(const name of ['ParcoursPedagogique','ModulePedagogique','LeconPedagogique','SupportLecon','ProgressionLecon'])assert.equal((await db.sql('SELECT count(*)::int AS n FROM "'+name+'"')).rows[0].n,0);
 results.push('migration sur douze schémas existants peuplés : données conservées, nouvelles tables vides, sept FK RESTRICT et schéma sans divergence');
 await db.sql(videoRollback);await db.sql(rollback);assert.deepEqual(await oldRows(),before);await db.sql(sql);await db.sql(videos);diff();results.push('retour arrière vide puis nouvelle application, anciennes données intactes');
 await db.sql(`INSERT INTO "ParcoursPedagogique" ("formationId","updatedAt") VALUES ('f',now()); INSERT INTO "ModulePedagogique" (id,"formationId",titre,ordre,publie,"updatedAt") VALUES ('m','f','Module',0,true,now()); INSERT INTO "LeconPedagogique" (id,"moduleId",titre,contenu,ordre,publie,"updatedAt") VALUES ('l','m','Leçon','Texte',0,true,now()); INSERT INTO "ProgressionLecon" ("inscriptionId","leconId",terminee,"termineeAt","updatedAt") VALUES ('i','l',true,now(),now());`);
 const rejected=(sql,params=[],code='23514')=>assert.rejects(()=>db.sql(sql,params),e=>{const accepted=Array.isArray(code)?code:[code];if(!accepted.includes(e.code))console.error('Code contrainte attendu '+accepted.join('|')+', reçu '+(e.code||e.name));return accepted.includes(e.code);});
 await rejected(`INSERT INTO "ModulePedagogique" (id,"formationId",titre,ordre,"updatedAt") VALUES ('bad','f','Titre',-1,now())`);
 await rejected(`INSERT INTO "ModulePedagogique" (id,"formationId",titre,ordre,"updatedAt") VALUES ('dup','f','Titre',0,now())`,[],'23505');
 await rejected(`INSERT INTO "LeconPedagogique" (id,"moduleId",titre,contenu,ordre,publie,"updatedAt") VALUES ('bad','m','Titre','',1,true,now())`);
 await rejected(`UPDATE "LeconPedagogique" SET archive=true WHERE id='l'`);
 await rejected(`INSERT INTO "ProgressionLecon" ("inscriptionId","leconId","updatedAt") VALUES ('i2','l',now())`);
 await rejected(`INSERT INTO "ProgressionLecon" ("inscriptionId","leconId",terminee,"termineeAt","updatedAt") VALUES ('i','l',true,now(),now())`,[],'23505');
 await rejected(`INSERT INTO "SupportLecon" (id,"leconId","depotId","stockageKey","nomOriginal",taille,"typeMime",empreinte,"auteurId") VALUES ('x','l',$1,$2,'x.pdf',1,'image/png',$3,'a')`,[randomUUID(),randomUUID(),'0'.repeat(64)]);
 await rejected(`DELETE FROM "LeconPedagogique" WHERE id='l'`,[],['23001','23503']);
 results.push('contraintes réelles : ordre, unicité, publication, archive, type PDF, progression inter-formation et suppression référencée refusés');
 await db.sql(`UPDATE "LeconPedagogique" SET publie=false,archive=true WHERE id='l'`);assert.equal((await db.sql('SELECT count(*)::int AS n FROM "ProgressionLecon"')).rows[0].n,1);
 await assert.rejects(()=>db.sql(rollback),e=>e.code==='P0001');await db.rollback();assert.deepEqual(await oldRows(),before);results.push('archivage conserve la progression ; rollback protégé avec données et anciennes lignes intactes');
 console.log('PASS '+results.join('\nPASS '));
}catch(e){console.error('FAIL SQL pédagogie : '+(e.code||e.name));const frame=e.stack?.split('\n').find(l=>l.includes('test-elearning-schema.mjs:'));if(frame)console.error(frame);process.exitCode=1;}
finally{if(db){writeFileSync(path.join(db.run,'pedagogie-schema-results.json'),JSON.stringify({success:!process.exitCode,results},null,2));await db.close();console.log('RAPPORT '+path.join(db.run,'pedagogie-schema-results.json'));}}
