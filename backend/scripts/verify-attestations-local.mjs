import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,readFileSync} from 'node:fs';
import {Client} from 'pg';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {backend} from './lib/isolated-db.mjs';
const dest=new URL(process.env.DATABASE_URL);
assert(['localhost','127.0.0.1','[::1]'].includes(dest.hostname));assert.equal(dest.port||'5432','5432');assert.equal(dest.pathname,'/cmh_academy_dev');
const db=new Client({connectionString:process.env.DATABASE_URL});const checks=[];
async function request(route,status=200){
 const res=await fetch('http://127.0.0.1:3001'+route);assert.equal(res.status,status);
 const text=await res.text();return text?JSON.parse(text):null;
}
function publicOnly(value){
 if(Array.isArray(value)){value.forEach(publicOnly);return;}
 if(!value||typeof value!=='object')return;
 for(const[key,child]of Object.entries(value)){assert(!['stockageKey','empreinte','fichiers','dossier','motDePasseHash','email','telephone','lienVisioconference','consignesPrivees','accesPrive','notes','note','questionnaires','questions','reponses','requeteId','presences','dureeSuivieMs','motifCorrection','attestations','organisme','donnees','empreinteRequete','pieceJointeId','motif'].includes(key),'Champ privé');publicOnly(child);}
}
try{
 await db.connect();const identity=(await db.query('SELECT current_database() AS db,host(inet_server_addr()) AS host,inet_server_port() AS port')).rows[0];
 assert.equal(identity.db,'cmh_academy_dev');assert(['127.0.0.1','::1'].includes(identity.host));assert.equal(identity.port,5432);
 await request('/api/health');await request('/api/health/database');checks.push('API et PostgreSQL accessibles');
 const legacy=await request('/api/formations');assert(Array.isArray(legacy.formations));for(const formation of legacy.formations)assert.deepEqual(Object.keys(formation).sort(),['description','id','titre']);publicOnly(legacy);
 const catalogue=await request('/api/catalogue/formations');publicOnly(catalogue);
 const formations=(await db.query('SELECT slug FROM "Formation" WHERE publiee=true')).rows;
 for(const row of formations){const detail=await request('/api/formations/'+encodeURIComponent(row.slug));publicOnly(detail);}
 checks.push('catalogue historique, catalogue enrichi et fiches publiées accessibles sans données privées');
 await request('/api/auth/moi',401);await request('/api/admin/inscriptions',401);
 for(const route of['/api/admin/inscriptions/inconnu/dossier','/api/admin/inscriptions/inconnu/dossier/elements/PROGRAMME/fichiers','/api/admin/inscriptions/inconnu/dossier/elements/PROGRAMME/fichiers/inconnu/telecharger'])await request(route,401);
 for(const route of ['/api/admin/questionnaires/modeles','/api/admin/questionnaires/modeles/inconnu','/api/admin/inscriptions/inconnu/questionnaires','/api/stagiaire/inscriptions','/api/stagiaire/inscriptions/inconnu/questionnaires','/api/stagiaire/inscriptions/inconnu/questionnaires/inconnu'])await request(route,401);
 for(const [route,method]of [['/api/admin/questionnaires/modeles','POST'],['/api/admin/inscriptions/inconnu/questionnaires','POST'],['/api/stagiaire/inscriptions/inconnu/questionnaires/inconnu/brouillon','PUT'],['/api/stagiaire/inscriptions/inconnu/questionnaires/inconnu/soumettre','POST']])assert.equal((await fetch('http://127.0.0.1:3001'+route,{method,headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 for(const route of ['/api/admin/sessions/inconnu/presences','/api/admin/inscriptions/inconnu/presences','/api/stagiaire/inscriptions/inconnu/presences'])await request(route,401);
 assert.equal((await fetch('http://127.0.0.1:3001/api/admin/inscriptions/inconnu/seances/inconnue/presence',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 checks.push('accès anonymes aux présences, dossiers, réponses et téléchargements refusés 401');
 for(const route of ['/api/admin/organisme-attestation','/api/admin/inscriptions/inconnu/dossier/attestations','/api/admin/inscriptions/inconnu/dossier/attestations/inconnue/telecharger','/api/stagiaire/inscriptions/inconnu/fichiers/inconnu/telecharger'])await request(route,401);
 for(const [route,method]of [['/api/admin/organisme-attestation','PUT'],['/api/admin/inscriptions/inconnu/dossier/attestations/apercu','POST'],['/api/admin/inscriptions/inconnu/dossier/attestations/emettre','POST']])assert.equal((await fetch('http://127.0.0.1:3001'+route,{method,headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 checks.push('accès anonymes aux attestations, configuration et téléchargements refusés 401');
 for(const base of['http://127.0.0.1:3001','http://127.0.0.1:5173']){
  for(const route of['/.private-documents/objets/00000000-0000-4000-8000-000000000000.blob','/backend/.private-documents/objets/00000000-0000-4000-8000-000000000000.blob']){
   const res=await fetch(base+route);assert(!res.ok||!(res.headers.get('content-type')||'').includes('application/octet-stream'));
  }
  // Ni l'API ni Vite ne doivent servir le véritable stockage, même vide.
  for(const route of['/.private-documents/','/backend/.private-documents/']){
   const res=await fetch(base+route);const body=await res.text();assert(!body.includes('Index of')&&!body.includes('Directory listing'));
  }
 }
 checks.push('aucun montage statique documentaire Express ; Vite reste limité au frontend');
 const history=(await db.query('SELECT migration_name,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at')).rows;
 assert.equal(history.length,12);assert(history.every(row=>row.finished_at&&!row.rolled_back_at));assert.equal(history.at(-1).migration_name,'20261111120000_attestations');
 const counts=(await db.query('SELECT (SELECT count(*)::int FROM "Inscription") AS inscriptions,(SELECT count(*)::int FROM "DossierAdministratif") AS dossiers,(SELECT count(*)::int FROM "PieceJointe") AS fichiers')).rows[0];
 checks.push('douze migrations terminées ; compteurs contrôlés');
 const newCounts=(await db.query('SELECT (SELECT count(*)::int FROM "Utilisateur") AS comptes,(SELECT count(*)::int FROM "ModeleQuestionnaire") AS modeles,(SELECT count(*)::int FROM "QuestionnaireAttribue") AS questionnaires')).rows[0];
 const fk=(await db.query("SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname IN ('ModeleQuestionnaire','QuestionnaireAttribue') AND c.contype='f'")).rows;assert.equal(fk.length,8);assert(fk.every(row=>row.definition.includes('ON DELETE RESTRICT')));
 const indexes=(await db.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='QuestionnaireAttribue_actif_unique'")).rows;assert.equal(indexes.length,1);assert(indexes[0].indexdef.includes('UNIQUE')&&indexes[0].indexdef.includes('WHERE'));
 checks.push('huit clés étrangères RESTRICT et index unique partiel présents');
 const presenceCounts=(await db.query('SELECT (SELECT count(*)::int FROM "Presence") AS presences,(SELECT count(*)::int FROM "ChangementPresence") AS historique_presences')).rows[0];
 const triggers=(await db.query("SELECT tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('cmh_presence_controler','cmh_presence_historiser','cmh_presences_verrouiller_seance','cmh_presences_verrouiller_inscription')")).rows;assert.equal(triggers.length,4);assert(triggers.every(t=>t.tgenabled==='O'));
 const presenceFK=(await db.query("SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname IN ('Presence','ChangementPresence') AND c.contype='f'")).rows;assert.equal(presenceFK.length,5);assert(presenceFK.every(row=>row.definition.includes('ON DELETE RESTRICT')));
 checks.push('quatre triggers activés et cinq clés étrangères RESTRICT de présence vérifiés');
 const attestationCounts=(await db.query('SELECT (SELECT count(*)::int FROM "OrganismeAttestation") AS organismes,(SELECT count(*)::int FROM "AttestationEmission") AS attestations')).rows[0];
 assert.equal(attestationCounts.organismes,0);assert.equal(attestationCounts.attestations,0);
 const attestationFK=(await db.query("SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname IN ('AttestationEmission','OrganismeAttestation') AND c.contype='f'")).rows;assert.equal(attestationFK.length,4);assert(attestationFK.every(r=>r.definition.includes('ON DELETE RESTRICT')));
 const attestationTrigger=(await db.query("SELECT tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgname='AttestationEmission_immutable'")).rows;assert.equal(attestationTrigger.length,1);assert.equal(attestationTrigger[0].tgenabled,'O');
 const currentIndex=(await db.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='AttestationEmission_courante_unique'")).rows;assert.equal(currentIndex.length,1);assert(currentIndex[0].indexdef.includes('UNIQUE')&&currentIndex[0].indexdef.includes('WHERE'));
 checks.push('zéro configuration ou attestation automatique ; quatre FK RESTRICT, trigger d’immuabilité et unicité de référence vérifiés');
 const signature={};
 for(const table of ['Utilisateur','Formation','Session','Seance','Inscription','DossierAdministratif','ElementDocumentaire','PieceJointe','Presence','ChangementPresence','OrganismeAttestation','AttestationEmission']){
  const rows=(await db.query('SELECT * FROM "'+table+'" ORDER BY row_to_json("'+table+'")::text COLLATE "C"')).rows;
  signature[table]={count:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};
 }
 const beforeFile=path.join(backend,'.local-backups/attestations-20261111-BS576J/lecture-avant.json');
 if(process.argv.includes('--avant'))writeFileSync(beforeFile,JSON.stringify(signature,null,2));
 else{assert(existsSync(beforeFile));assert.deepEqual(signature,JSON.parse(readFileSync(beforeFile,'utf8')));checks.push('consultations navigateur/API sans écriture métier : données, horaires et présences identiques');}
 const result={success:true,checks,counts:{...counts,...newCounts,...presenceCounts,...attestationCounts},publishedFormations:formations.length};
 writeFileSync(path.join(backend,'.local-backups/attestations-20261111-BS576J/controles-locaux.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error('Contrôle local interrompu : '+(error.code||error.name));process.exitCode=1;}
finally{await db.end();}
