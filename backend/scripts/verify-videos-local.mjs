import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import {readFileSync,writeFileSync,lstatSync,readdirSync} from 'node:fs';
import {parseEnv} from 'node:util';
import path from 'node:path';
import {Client} from 'pg';
import {PrismaClient} from '@prisma/client';
import {backend} from './lib/isolated-db.mjs';
import {createPrismaAdapter} from '../lib/prisma-adapter.js';
import {createDocumentStorage,empreinteFichier} from '../lib/documents.js';
import {videoProbeStatus,videoProbeError} from '../lib/videos.js';

const variables=parseEnv(readFileSync(path.join(backend,'.env'),'utf8'));
const destination=new URL(variables.DATABASE_URL);
assert(['localhost','127.0.0.1','[::1]'].includes(destination.hostname));assert.equal(destination.port||'5432','5432');assert.equal(destination.pathname,'/cmh_academy_dev');
const supplied=process.argv.find(arg=>arg.startsWith('--backup='));assert(supplied,'Dossier de sauvegarde --backup requis.');
const folder=path.resolve(backend,supplied.slice('--backup='.length));assert(folder.startsWith(path.join(backend,'.local-backups')+path.sep));
const migration=JSON.parse(readFileSync(path.join(folder,'resultats.json'),'utf8'));assert(migration.success&&migration.restorationVerified);
const base='http://127.0.0.1:'+Number(variables.PORT||3001),root=path.resolve(backend,variables.DOCUMENT_STORAGE_DIR||'.private-documents');
const baselineFile=path.join(folder,'lecture-apres-migration.json'),checks=[];
const db=new Client({connectionString:variables.DATABASE_URL,connectionTimeoutMillis:5000});let prisma;
const hash=value=>createHash('sha256').update(value).digest('hex');
async function snapshot(){
 const data={};const tables=(await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('AuthSession','_prisma_migrations') ORDER BY tablename`)).rows;
 for(const {tablename}of tables){assert(/^[A-Za-z_]+$/.test(tablename));const rows=(await db.query('SELECT to_jsonb(t) AS row FROM "'+tablename+'" t ORDER BY to_jsonb(t)::text COLLATE "C"')).rows;data[tablename]={count:rows.length,sha256:hash(JSON.stringify(rows))};}
 return data;
}
async function files(base,relative=''){
 const result=[];for(const name of readdirSync(path.join(base,relative)).sort()){const rel=path.join(relative,name),filename=path.join(base,rel),info=lstatSync(filename);assert(!info.isSymbolicLink());if(info.isDirectory())result.push({path:rel,directory:true},...await files(base,rel));else{assert(info.isFile());result.push({path:rel,size:info.size,sha256:await empreinteFichier(filename)});}}return result;
}
function publicOnly(value){if(Array.isArray(value))return value.forEach(publicOnly);if(!value||typeof value!=='object')return;for(const [key,child]of Object.entries(value)){assert(!['stockageKey','empreinte','motDePasseHash','email','telephone','accesPrive','lienVisioconference','notes','questions','reponses','modules','lecons','supports','progression','videos','transcription','depotId','auteurId'].includes(key));publicOnly(child);}}
async function request(route,status=200,options={}){const response=await fetch(base+route,options);assert.equal(response.status,status);const body=await response.text();return body?JSON.parse(body):null;}
try {
 await db.connect();const identity=(await db.query('SELECT current_database() AS db,current_user AS role,host(inet_server_addr()) AS host,inet_server_port() AS port')).rows[0];assert.equal(identity.db,'cmh_academy_dev');assert.equal(identity.role,'cmh_app');assert(['127.0.0.1','::1'].includes(identity.host));assert.equal(identity.port,5432);
 const history=(await db.query('SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at')).rows;
 assert.equal(history.length,14);assert.equal(history.at(-1).migration_name,'20261111180000_videos_pedagogiques');for(const row of history){assert(row.finished_at&&!row.rolled_back_at);assert.equal(row.checksum,hash(readFileSync(path.join(backend,'prisma/migrations',row.migration_name,'migration.sql'))));}
 checks.push('quatorze migrations terminées et empreintes conformes');
 const before=await snapshot(),privateFiles=await files(root);
 for(const [table,count]of Object.entries(migration.counts)){if(table!=='AuthSession')assert.equal(before[table].count,count);}
 assert.equal(before.VideoLecon.count,0);
 if(process.argv.includes('--baseline')){
  writeFileSync(baselineFile,JSON.stringify({data:before,files:privateFiles},null,2));
  const sessions=(await db.query(`SELECT count(*)::int AS n FROM "AuthSession" s JOIN "Utilisateur" u ON u.id=s.sess->>'userId' WHERE u.actif AND u.role='ADMIN' AND s.expire>now() AND (s.sess->>'authExpiresAt')::numeric>$1`,[Date.now()])).rows[0].n;
  console.log(JSON.stringify({success:true,baseline:true,migrations:history.length,existingAdminSessions:sessions,counts:Object.fromEntries(Object.entries(before).map(([name,value])=>[name,value.count])),storageFiles:privateFiles.filter(r=>!r.directory).length}));
 }else{
  const baseline=JSON.parse(readFileSync(baselineFile,'utf8'));assert.deepEqual(before,baseline.data);assert.deepEqual(privateFiles,baseline.files);
  await request('/api/health');await request('/api/health/database');
  const legacy=await request('/api/formations'),catalogue=await request('/api/catalogue/formations');publicOnly(legacy);publicOnly(catalogue);
  const published=(await db.query('SELECT id,slug FROM "Formation" WHERE publiee=true')).rows;for(const formation of published)publicOnly(await request('/api/formations/'+encodeURIComponent(formation.slug)));
  checks.push('catalogues et fiches publiées fonctionnels, contrats publics sans donnée privée');
  const adminRoot='/api/admin/formations/'+(await db.query('SELECT id FROM "Formation" ORDER BY id LIMIT 1')).rows[0].id+'/contenu';
  const studentRoot='/api/stagiaire/inscriptions/inconnue/parcours';
  for(const route of ['/api/auth/moi','/api/admin/inscriptions','/api/stagiaire/inscriptions',adminRoot,studentRoot,studentRoot+'/lecons/inconnue'])await request(route,401);
  for(const route of [adminRoot+'/lecons/inconnue/videos/inconnue/lecture',studentRoot+'/lecons/inconnue/videos/inconnue/lecture'])for(const method of ['GET','HEAD'])await request(route,401,{method,headers:{Range:'bytes=0-99'}});
  await request(adminRoot+'/lecons/inconnue/videos',401,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  checks.push('anonymes refusés sur administration, espace stagiaire, parcours et vidéos GET/HEAD/Range/écriture');
  // Reuse an already valid server-side ADMIN session, without creating a user,
  // logging in, extending its lifetime or writing an application session.
  const existing=(await db.query(`SELECT s.sid,u.id AS "userId" FROM "AuthSession" s JOIN "Utilisateur" u ON u.id=s.sess->>'userId' WHERE u.actif AND u.role='ADMIN' AND s.expire>now() AND (s.sess->>'authExpiresAt')::numeric>$1 ORDER BY s.expire DESC LIMIT 1`,[Date.now()])).rows[0];
  assert(existing,'Une session ADMIN préexistante valide est nécessaire ; se connecter normalement puis relancer.');
  const signed=existing.sid+'.'+createHmac('sha256',variables.SESSION_SECRET).update(existing.sid).digest('base64').replace(/=+$/,'');
  const headers={Cookie:'cmh.sid='+encodeURIComponent('s:'+signed)};
  const account=await request('/api/admin/moi',200,{headers});assert.equal(account.user.id,existing.userId);assert.equal(account.user.role,'ADMIN');
  const tree=await request(adminRoot,200,{headers});assert.deepEqual(tree.modules,[]);assert.equal(tree.revision,0);assert(tree.videoProbe.available);assert(Number.isSafeInteger(tree.videoMaxFileBytes));
  await request('/api/stagiaire/inscriptions',403,{headers});await request(adminRoot+'/lecons/inconnue/videos/inconnue/lecture',404,{headers});
  await request(adminRoot+'/lecons/inconnue/videos',403,{method:'POST',headers:{...headers,Origin:'http://localhost:5173','Content-Type':'application/json'},body:'{}'});
  checks.push('session ADMIN existante conservée, parcours vide correct, aucun contenu créé, rôle stagiaire distinct et CSRF maintenu');
  for(const origin of [base,'http://127.0.0.1:5173'])for(const route of ['/.private-documents/','/backend/.private-documents/','/.env']){const response=await fetch(origin+route);const body=await response.text();assert(!body.includes('Index of')&&!body.includes('Directory listing')&&!body.includes('DATABASE_URL=')&&!body.includes('SESSION_SECRET='));}
  for(const route of ['/formations','/admin/connexion','/stagiaire/connexion','/stagiaire','/admin/catalogue/formations']){const response=await fetch('http://127.0.0.1:5173'+route);assert.equal(response.status,200);assert((await response.text()).includes('/src/main.jsx'));}
  checks.push('points d’entrée frontend disponibles et stockage/configuration privés non servis');
  const probe=await videoProbeStatus(variables.VIDEO_FFPROBE_PATH||'ffprobe');assert(probe.available);const absent=await videoProbeStatus(path.join(folder,'ffprobe-absent.exe'));assert.deepEqual(absent,{available:false,error:videoProbeError});
  checks.push('ffprobe disponible depuis la configuration habituelle et absence signalée explicitement');
  prisma=new PrismaClient({adapter:createPrismaAdapter(variables.DATABASE_URL)});
  const audit=await createDocumentStorage({root}).audit(prisma,{ageMs:0});assert.deepEqual(audit,{temporaires:[],orphelins:[],manquants:[],alteres:[],inconnus:0,temporairesNettoyes:0});
  assert.deepEqual(await snapshot(),baseline.data);assert.deepEqual(await files(root),baseline.files);
  checks.push('audit privé propre et consultations sans écriture métier ni création de vidéo');
  const report={success:true,checks,counts:Object.fromEntries(Object.entries(before).map(([name,value])=>[name,value.count])),storageFiles:privateFiles.filter(r=>!r.directory).length,storageBytes:privateFiles.filter(r=>!r.directory).reduce((n,r)=>n+r.size,0),ffprobe:probe,limitations:['Pas de compte STAGIAIRE ni inscription dans la base locale : parcours authentifié stagiaire exercé uniquement en isolation.','Contrôle visuel local indisponible : outil ordinateur interrompu faute de certitude sur URL Chrome.']};
  writeFileSync(path.join(folder,'controles-locaux.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }
}catch(error){console.error('Contrôle local interrompu : '+(error.code||error.name));writeFileSync(path.join(folder,'controle-erreur.json'),JSON.stringify({success:false,code:error.code||error.name,checks,message:error.message==='Une session ADMIN préexistante valide est nécessaire ; se connecter normalement puis relancer.'?error.message:undefined},null,2));process.exitCode=1;}
finally{await prisma?.$disconnect();await db.end();}
