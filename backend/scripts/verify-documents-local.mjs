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
 for(const[key,child]of Object.entries(value)){assert(!['stockageKey','empreinte','fichiers','dossier','motDePasseHash','email','telephone','lienVisioconference','consignesPrivees','accesPrive','notes','note'].includes(key),'Champ privé');publicOnly(child);}
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
 checks.push('accès anonymes dossier, versions et téléchargement refusés 401');
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
 assert.equal(history.length,8);assert(history.every(row=>row.finished_at&&!row.rolled_back_at));assert.equal(history.at(-1).migration_name,'20261109180000_pieces_jointes');
 const counts=(await db.query('SELECT (SELECT count(*)::int FROM "Inscription") AS inscriptions,(SELECT count(*)::int FROM "DossierAdministratif") AS dossiers,(SELECT count(*)::int FROM "PieceJointe") AS fichiers')).rows[0];
 checks.push('huit migrations terminées ; compteurs contrôlés');
 const result={success:true,checks,counts,publishedFormations:formations.length};
 writeFileSync(path.join(backend,'.local-backups/pieces-jointes-20261109-84QZXW/controles-locaux.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}catch(error){console.error('Contrôle local interrompu : '+(error.code||error.name));process.exitCode=1;}
finally{await db.end();}
