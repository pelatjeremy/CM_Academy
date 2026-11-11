import assert from 'node:assert/strict';
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
 for(const[key,child]of Object.entries(value)){assert(!['stockageKey','empreinte','fichiers','dossier','motDePasseHash','email','telephone','lienVisioconference','consignesPrivees','accesPrive','notes','note','questionnaires','questions','reponses','requeteId'].includes(key),'Champ privé');publicOnly(child);}
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
 checks.push('accès anonymes aux modèles, attributions, réponses, formations personnelles et téléchargements refusés 401');
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
 assert.equal(history.length,10);assert(history.every(row=>row.finished_at&&!row.rolled_back_at));assert.equal(history.at(-1).migration_name,'20261109200000_questionnaires');
 const counts=(await db.query('SELECT (SELECT count(*)::int FROM "Inscription") AS inscriptions,(SELECT count(*)::int FROM "DossierAdministratif") AS dossiers,(SELECT count(*)::int FROM "PieceJointe") AS fichiers')).rows[0];
 checks.push('dix migrations terminées ; compteurs contrôlés');
 const newCounts=(await db.query('SELECT (SELECT count(*)::int FROM "Utilisateur") AS comptes,(SELECT count(*)::int FROM "ModeleQuestionnaire") AS modeles,(SELECT count(*)::int FROM "QuestionnaireAttribue") AS questionnaires')).rows[0];
 const fk=(await db.query("SELECT pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname IN ('ModeleQuestionnaire','QuestionnaireAttribue') AND c.contype='f'")).rows;assert.equal(fk.length,8);assert(fk.every(row=>row.definition.includes('ON DELETE RESTRICT')));
 const indexes=(await db.query("SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='QuestionnaireAttribue_actif_unique'")).rows;assert.equal(indexes.length,1);assert(indexes[0].indexdef.includes('UNIQUE')&&indexes[0].indexdef.includes('WHERE'));
 checks.push('huit clés étrangères RESTRICT et index unique partiel présents');
 const result={success:true,checks,counts:{...counts,...newCounts},publishedFormations:formations.length};
 writeFileSync(path.join(backend,'.local-backups/questionnaires-20261109-9dND36/controles-locaux.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error('Contrôle local interrompu : '+(error.code||error.name));process.exitCode=1;}
finally{await db.end();}
