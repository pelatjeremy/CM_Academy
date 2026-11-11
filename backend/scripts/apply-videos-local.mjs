import net from 'node:net';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync,existsSync,lstatSync,realpathSync,cpSync,unlinkSync,linkSync} from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {pathToFileURL} from 'node:url';
import {Client} from 'pg';
import {isolatedDb,backend} from './lib/isolated-db.mjs';
import {createPrismaAdapter} from '../lib/prisma-adapter.js';
import {createDocumentStorage} from '../lib/documents.js';

assert(process.argv.includes('--apply')||process.argv.includes('--check'),'Option --check ou --apply requise.');
const expectedHistory=['20261022174525_creation_formations','20261024150000_catalogue','20261024180000_authentification','20261025100000_consignes_sessions','20261025160000_visibilite_sessions','20261106120000_preinscriptions','20261109150000_dossiers_administratifs','20261109180000_pieces_jointes','20261109190000_espace_stagiaire','20261109200000_questionnaires','20261109210000_presences_manuelles','20261111120000_attestations','20261111160000_contenu_pedagogique'];
const target='20261111180000_videos_pedagogiques';
const variables=parseEnv(readFileSync(path.join(backend,'.env'),'utf8'));
const destination=new URL(variables.DATABASE_URL);
assert(['localhost','127.0.0.1','[::1]'].includes(destination.hostname));
assert.equal(destination.port||'5432','5432');
assert.equal(destination.pathname,'/cmh_academy_dev');assert.equal(destination.searchParams.size,0);
const root=path.resolve(backend,variables.DOCUMENT_STORAGE_DIR||'.private-documents');
const maxFileBytes=Number(variables.DOCUMENT_MAX_FILE_BYTES||10485760);
const store=createDocumentStorage({root,maxFileBytes});
assert(readFileSync(path.join(backend,'../.gitignore'),'utf8').split(/\r?\n/).includes('.private-documents/'));
assert.equal(root,path.join(backend,'.private-documents'),'Examiner une configuration personnalisée avant application.');
mkdirSync(root,{recursive:true,mode:0o700});
assert.equal(realpathSync(root).toLowerCase(),root.toLowerCase());
assert(!lstatSync(root).isSymbolicLink());
const backupRoot=path.join(backend,'.local-backups');mkdirSync(backupRoot,{recursive:true});
const folder=mkdtempSync(path.join(backupRoot,'videos-20261111-'));
const dump=path.join(folder,'avant-videos.dump');
const bin=process.env.CMH_PG_BIN||'C:/Program Files/PostgreSQL/18/bin';
const environment=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PG/i.test(key)&&!['DATABASE_URL','SHADOW_DATABASE_URL','SESSION_SECRET'].includes(key)));
const prismaEnvironment={...environment,DATABASE_URL:variables.DATABASE_URL,SHADOW_DATABASE_URL:variables.SHADOW_DATABASE_URL||''};
const hash=value=>createHash('sha256').update(value).digest('hex');
const migrationFolder=path.join(backend,'prisma/migrations');
const migrationHash=name=>hash(readFileSync(path.join(migrationFolder,name,'migration.sql')));
const tables=['Formation','Pole','Formateur','FormationFormateur','Session','Seance','SessionAccesPrive','Utilisateur','AuthSession','Inscription','ChangementInscription','DossierAdministratif','ElementDocumentaire','ChangementDocumentaire','PieceJointe','InvitationStagiaire','RattachementStagiaire','PartagePieceJointe','ModeleQuestionnaire','QuestionnaireAttribue','Presence','ChangementPresence','OrganismeAttestation','AttestationEmission','ParcoursPedagogique','ModulePedagogique','LeconPedagogique','SupportLecon','ProgressionLecon'];
const db=new Client({connectionString:variables.DATABASE_URL,connectionTimeoutMillis:5000});
let fixture,restoredPrisma,phase='destination',applied=false;const events=[];
function record(message){events.push(message);console.log(message);}
function redact(value){let text=String(value).replace(/postgres(?:ql)?:\/\/[^\s"'<>]+/gi,'[connexion masquée]');for(const secret of[variables.DATABASE_URL,destination.password,decodeURIComponent(destination.password)])if(secret)text=text.replaceAll(secret,'[secret masqué]');return text;}
function command(exe,args,env=environment){
 const result=spawnSync(exe,args,{cwd:backend,env,encoding:'utf8',windowsHide:true,timeout:120000});
 writeFileSync(path.join(folder,'diagnostics.log'),redact(path.basename(exe)+'\n'+(result.stdout||'')+'\n'+(result.stderr||'')+'\n'),{flag:'a'});
 assert.equal(result.status,0,'Échec outil '+path.basename(exe));return result.stdout;
}
const prisma=(...args)=>command(process.execPath,[path.join(backend,'node_modules/prisma/build/index.js'),...args],prismaEnvironment);
async function identify(){
 const row=(await db.query('SELECT current_database() AS db,current_user AS role,host(inet_server_addr()) AS host,inet_server_port() AS port')).rows[0];
 assert.equal(row.db,'cmh_academy_dev');assert.equal(row.role,'cmh_app');assert(['127.0.0.1','::1'].includes(row.host));assert.equal(row.port,5432);
}
function checkFiles(){assert.deepEqual(readdirSync(migrationFolder).filter(n=>n!=='migration_lock.toml').sort(),[...expectedHistory,target]);}
async function snapshot(client,extra=false){
 const rows={};for(const table of[...tables,...(extra?['VideoLecon']:[])])rows[table]=(await client.query('SELECT * FROM public."'+table+'" ORDER BY row_to_json("'+table+'")::text')).rows;
 const history=(await client.query('SELECT * FROM public._prisma_migrations ORDER BY started_at')).rows;
 const columns=(await client.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 const constraints=(await client.query("SELECT t.relname AS table_name,c.conname,c.contype,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' ORDER BY t.relname,c.conname")).rows;
 // pg_dump/pg_restore reparse ce CHECK : PostgreSQL peut déplacer le cast
 // varchar[] -> text[] sur chaque constante. Seules ces deux formes exactes,
 // sémantiquement équivalentes, sont admises ; aucune contrainte n'est modifiée.
 const mimeOriginal=`CHECK ((("typeMime")::text = ANY ((ARRAY['application/pdf'::character varying, 'image/jpeg'::character varying, 'image/png'::character varying])::text[])))`;
 const mimeRestored=`CHECK ((("typeMime")::text = ANY (ARRAY[('application/pdf'::character varying)::text, ('image/jpeg'::character varying)::text, ('image/png'::character varying)::text])))`;
 for(const row of constraints)if(row.table_name==='PieceJointe'&&row.conname==='PieceJointe_typeMime_check'){
  assert([mimeOriginal,mimeRestored].includes(row.definition),'Définition MIME inattendue.');
  row.definition=mimeOriginal;
 }
 const indexes=(await client.query("SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname")).rows;
 const triggers=(await client.query("SELECT t.tgname,t.tgenabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY t.tgname")).rows;
 // L'ordre des lignes dépend de la collation du cluster. Comparer des ensembles
 // dans un ordre déterministe JavaScript, sans modifier les valeurs sauvegardées.
 const stableSort=items=>items.sort((a,b)=>{const left=JSON.stringify(a),right=JSON.stringify(b);return left<right?-1:left>right?1:0;});
 for(const values of Object.values(rows))stableSort(values);
 stableSort(columns);stableSort(constraints);stableSort(indexes);stableSort(triggers);
 return {rows,history,columns,constraints,indexes,triggers};
}
function manifest(base,relative=''){
 const entries=[];for(const name of readdirSync(path.join(base,relative)).sort()){
  const rel=path.join(relative,name),file=path.join(base,rel),info=lstatSync(file);assert(!info.isSymbolicLink(),'Lien symbolique inattendu.');
  if(info.isDirectory())entries.push({path:rel,directory:true},...manifest(base,rel));
  else {assert(info.isFile());entries.push({path:rel,size:info.size,sha256:hash(readFileSync(file))});}
 }return entries;
}
function pgEnv(url){return {...environment,PGHOST:url.hostname==='[::1]'?'::1':url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)};}
async function backendStopped(){
 await new Promise((resolve,reject)=>{const socket=net.createConnection({host:'127.0.0.1',port:Number(variables.PORT||3001)});socket.once('connect',()=>{socket.destroy();reject(new Error('BACKEND_ACTIF'));});socket.once('error',error=>error.code==='ECONNREFUSED'?resolve():reject(error));socket.setTimeout(2000,()=>{socket.destroy();reject(new Error('BACKEND_DESTINATION_AMBIGUE'));});});
}
try{
 if(process.argv.includes('--apply'))await backendStopped();
 await db.connect();await identify();checkFiles();
 const before=await snapshot(db);assert.deepEqual(before.history.map(row=>row.migration_name),expectedHistory);
 for(const row of before.history){assert(row.finished_at&&!row.rolled_back_at);assert.equal(row.checksum,migrationHash(row.migration_name));}
 const schema=readFileSync(path.join(backend,'prisma/schema.prisma'),'utf8');
 const baseline=schema.replace(/^model VideoLecon \{[\s\S]*?^\}\s*/gm,'').replace(/^.*\bVideoLecon.*\r?\n/gm,'');
 assert(!baseline.includes('VideoLecon'));const baselineFile=path.join(folder,'avant-videos.prisma');writeFileSync(baselineFile,baseline);
 prisma('validate');prisma('migrate','diff','--from-config-datasource','--to-schema',baselineFile,'--exit-code');
 record('localhost:5432 / cmh_academy_dev : treize migrations avec empreintes conformes, aucune divergence.');
 if(!process.argv.includes('--apply')){
  const summary={success:true,preflight:true,migrations:before.history.length,counts:Object.fromEntries(Object.entries(before.rows).map(([table,rows])=>[table,rows.length])),storageFiles:manifest(root).filter(r=>!r.directory).length,storageBytes:manifest(root).filter(r=>!r.directory).reduce((n,r)=>n+r.size,0)};
  writeFileSync(path.join(folder,'preflight.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
 } else {
 phase='stockage et sauvegarde';
 for(const child of['temporaires','objets']){mkdirSync(path.join(root,child),{recursive:true,mode:0o700});assert(lstatSync(path.join(root,child)).isDirectory()&&!lstatSync(path.join(root,child)).isSymbolicLink());}
 // Sonde technique éphémère : vérifie écriture, lien exclusif et suppression sans pièce documentaire.
 const probe=path.join(root,'temporaires',randomUUID()+'.probe'),linked=path.join(root,'objets',randomUUID()+'.probe');
 try{writeFileSync(probe,'',{flag:'wx',mode:0o600});linkSync(probe,linked);}finally{if(existsSync(linked))unlinkSync(linked);if(existsSync(probe))unlinkSync(probe);}
 const filesBefore=manifest(root);assert(!filesBefore.some(row=>!row.directory&&row.path.startsWith('temporaires'+path.sep)),'Interruption : temporaires préexistants à examiner.');
 command(path.join(bin,'pg_dump.exe'),['--format=custom','--file',dump],pgEnv(destination));
 const listing=command(path.join(bin,'pg_restore.exe'),['--list',dump]);assert(listing.includes('ElementDocumentaire')&&listing.includes('_prisma_migrations'));
 const copied=path.join(folder,'stockage-prive');cpSync(root,copied,{recursive:true,errorOnExist:true,force:false});assert.deepEqual(manifest(copied),filesBefore);
 writeFileSync(path.join(folder,'stockage-manifeste.json'),JSON.stringify(filesBefore,null,2));
 record('Sauvegarde PostgreSQL custom et copie privée avec empreintes réalisées hors versionnement.');
 phase='restauration conjointe isolée';
 fixture=await isolatedDb();await fixture.guard();const isolatedUrl=new URL(fixture.connectionString);
 command(path.join(bin,'pg_restore.exe'),['--exit-on-error','--no-owner','--no-acl','--dbname',decodeURIComponent(isolatedUrl.pathname.slice(1)),dump],pgEnv(isolatedUrl));
 const restoredSnapshot=await snapshot({query:fixture.sql});
 if(JSON.stringify(restoredSnapshot)!==JSON.stringify(before)){
  const paths=[];
  function differences(a,b,p=''){
   if(JSON.stringify(a)===JSON.stringify(b))return;
   if(a&&b&&typeof a==='object'&&typeof b==='object'&&!(a instanceof Date)&&!(b instanceof Date)){
    for(const key of new Set([...Object.keys(a),...Object.keys(b)]))differences(a[key],b[key],p+'.'+key);
   }else paths.push(p);
  }
  differences(restoredSnapshot,before);
  const constraintDifferences=restoredSnapshot.constraints.flatMap((row,index)=>JSON.stringify(row)===JSON.stringify(before.constraints[index])?[]:[{restored:row,source:before.constraints[index]}]);
  writeFileSync(path.join(folder,'ecarts-restauration.json'),JSON.stringify({paths,constraintDifferences},null,2));
 }
 assert.deepEqual(restoredSnapshot,before);
 const restoredRoot=path.join(fixture.run,'stockage-restaure');cpSync(copied,restoredRoot,{recursive:true});assert.deepEqual(manifest(restoredRoot),filesBefore);
 const isolatedSchema=path.join(fixture.run,'schema.prisma');writeFileSync(isolatedSchema,schema.replace('provider = "prisma-client-js"','provider = "prisma-client-js"\n  output = "./client"'));
 const config=path.join(fixture.run,'prisma.config.ts');writeFileSync(config,"import {defineConfig,env} from 'prisma/config'; export default defineConfig({schema:"+JSON.stringify(isolatedSchema)+",migrations:{path:"+JSON.stringify(migrationFolder)+"},datasource:{url:env('CMH_RESTORE_URL')}});");
 const isolatedCli=(...args)=>command(process.execPath,[path.join(backend,'node_modules/prisma/build/index.js'),...args,'--config',config],{...environment,CMH_RESTORE_URL:fixture.connectionString});
 await fixture.guard();isolatedCli('migrate','deploy');isolatedCli('generate');isolatedCli('migrate','diff','--from-config-datasource','--to-schema',isolatedSchema,'--exit-code');
 const {PrismaClient}=await import(pathToFileURL(path.join(fixture.run,'client/index.js')).href);
 restoredPrisma=new PrismaClient({adapter:createPrismaAdapter(fixture.connectionString)});
 const restoreAudit=await createDocumentStorage({root:restoredRoot,maxFileBytes}).audit(restoredPrisma);
 assert.deepEqual(restoreAudit,{temporaires:[],orphelins:[],manquants:[],alteres:[],inconnus:0,temporairesNettoyes:0});
 await restoredPrisma.$disconnect();restoredPrisma=undefined;await fixture.close();fixture=undefined;
 record('Restauration conjointe vérifiée sur cluster neuf : données, schéma, historique et fichiers identiques ; migration et audit isolés conformes.');
 phase='application locale';
 await backendStopped();
 await identify();checkFiles();assert.deepEqual(await snapshot(db),before);assert.deepEqual(manifest(root),filesBefore);
 const hashes=[...expectedHistory,target].map(name=>[name,migrationHash(name)]);
 prisma('migrate','deploy');applied=true;for(const[name,checksum]of hashes)assert.equal(migrationHash(name),checksum);
 prisma('generate');prisma('migrate','status');prisma('migrate','diff','--from-config-datasource','--to-schema','prisma/schema.prisma','--exit-code');
 const after=await snapshot(db,true);const oldRows={...after.rows};for(const name of ['VideoLecon']){assert.equal(oldRows[name].length,0);delete oldRows[name];}
 assert.deepEqual(oldRows,before.rows);
 assert.deepEqual(after.triggers.filter(row=>row.tgname!=='VideoLecon_immutable'),before.triggers);
 assert.equal(after.triggers.filter(row=>row.tgname==='VideoLecon_immutable'&&row.tgenabled==='O').length,1);
 assert.deepEqual(after.history.filter(row=>row.migration_name!==target),before.history);assert.equal(after.history.length,14);
 for(const row of after.history){assert(row.finished_at&&!row.rolled_back_at);assert.equal(row.checksum,migrationHash(row.migration_name));}
 assert.deepEqual(manifest(root),filesBefore);
 const {PrismaClient:LocalPrisma}=await import('@prisma/client');const local=new LocalPrisma({adapter:createPrismaAdapter(variables.DATABASE_URL)});
 let audit;try{audit=await store.audit(local);}finally{await local.$disconnect();}
 assert.deepEqual(audit,{temporaires:[],orphelins:[],manquants:[],alteres:[],inconnus:0,temporairesNettoyes:0});
 record('Migration attendue appliquée seule, client régénéré, quatorze migrations terminées et schéma sans divergence.');
 record('Toutes données et fichiers conservés ; audit complet sans anomalie et sans nettoyage.');
 writeFileSync(path.join(folder,'resultats.json'),JSON.stringify({success:true,destination:'localhost:5432/cmh_academy_dev',migration:target,storage:root,maxFileBytes,backup:dump,backupSha256:hash(readFileSync(dump)),storageFiles:filesBefore.filter(row=>!row.directory).length,restorationVerified:true,restoreAudit,audit,countsBefore:Object.fromEntries(Object.entries(before.rows).map(([name,rows])=>[name,rows.length])),counts:Object.fromEntries(Object.entries(after.rows).map(([name,rows])=>[name,rows.length])),events},null,2));
}
}catch(error){
 writeFileSync(path.join(folder,'resultats.json'),JSON.stringify({success:false,phase,applied,code:error.code||error.name,events},null,2));
 console.error('STOP : '+phase+' ('+(error.code||error.name)+'). Diagnostics conservés sans données personnelles.');process.exitCode=1;
}finally{
 if(restoredPrisma)await restoredPrisma.$disconnect().catch(()=>{});if(fixture)await fixture.close().catch(()=>{});await db.end().catch(()=>{});
 console.log('Sauvegarde et diagnostics : '+folder);
}
