import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { isolatedDb, backend } from './lib/isolated-db.mjs';
import { createPrismaAdapter } from '../lib/prisma-adapter.js';
import { createApp } from '../app.js';
import { hashPassword } from '../auth/passwords.js';
import { createFirstAdmin } from '../auth/provision-admin.js';
import { inscriptionTransaction } from '../lib/preinscriptions.js';

let fixture, prisma, instance, server, vite;
const results=[];
let step='initialisation';
const pass=message=>{results.push(message);console.log(`PASS ${message}`);};
const origin='http://127.0.0.1:5173';
const sessionSecret=randomBytes(48).toString('hex');
const password=randomBytes(24).toString('base64url');
let base;
async function start(options={}) {
  instance=await createApp({prisma,connectionString:fixture.connectionString,sessionSecret,origins:[origin],documentStorage:{root:path.join(fixture.run,'documents')},...options});
  server=instance.app.listen(0,'127.0.0.1'); await new Promise(resolve=>server.once('listening',resolve));
  base=`http://127.0.0.1:${server.address().port}`;
}
async function stop() {
  if(server) await new Promise(resolve=>server.close(resolve));
  server=undefined;
  if(instance) await instance.close(); instance=undefined;
}
function client() {
  return {cookie:'',csrf:'', async request(route, options={}) {
    const headers={Origin:origin,...options.headers};
    if(this.cookie) headers.Cookie=this.cookie;
    const response=await fetch(base+route,{...options,headers});
    const set=response.headers.getSetCookie(); if(set.length) this.cookie=set[0].split(';')[0];
    return response;
  },async token(){ const res=await this.request('/api/auth/csrf'); assert.equal(res.status,200);this.csrf=(await res.json()).csrfToken;return res; },
  async login(email='admin@auth-test.invalid',secret=password){await this.token();return this.request('/api/auth/connexion',{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':this.csrf},body:JSON.stringify({email,password:secret})});}};
}
try {
  const native=()=>Object.assign(new Error('CONFLICT_TEST'),{name:'DriverAdapterError',cause:{kind:'TransactionWriteConflict',originalCode:'40001'}});
  let attempts=0;assert.equal(await inscriptionTransaction({$transaction:async action=>{if(++attempts<3)throw native();return action({});}},async()=>true),true);assert.equal(attempts,3);
  attempts=0;await assert.rejects(()=>inscriptionTransaction({$transaction:async()=>{attempts++;throw native();}},async()=>{}),error=>error.code==='P2034');assert.equal(attempts,4);
  attempts=0;const uncertain=Object.assign(new Error('UNCERTAIN_COMMIT_TEST'),{name:'DriverAdapterError',cause:{kind:'ConnectionClosed',originalCode:'ECONNRESET'}});await assert.rejects(()=>inscriptionTransaction({$transaction:async()=>{attempts++;throw uncertain;}},async()=>{}),error=>error===uncertain);assert.equal(attempts,1);
  pass('conflits natifs de sérialisation normalisés, quatre essais maximum et aucune reprise d’un commit réseau incertain');
  fixture=await isolatedDb(); pass('destination indépendante vérifiée avant les écritures');
  const schema=readFileSync(path.join(backend,'prisma/schema.prisma'),'utf8').replace('provider = "prisma-client-js"','provider = "prisma-client-js"\n  output = "./client"');
  const schemaPath=path.join(fixture.run,'schema.prisma');writeFileSync(schemaPath,schema);
  const config=path.join(fixture.run,'prisma.config.ts');
  writeFileSync(config,`import {defineConfig,env} from 'prisma/config'; export default defineConfig({schema:${JSON.stringify(schemaPath)},migrations:{path:${JSON.stringify(path.join(backend,'prisma/migrations'))}},datasource:{url:env('CMH_AUTH_TEST_URL')}});`);
  const cli=(...args)=>fixture.command(process.execPath,[path.join(backend,'node_modules/prisma/build/index.js'),...args,'--config',config],{CMH_AUTH_TEST_URL:fixture.connectionString});
  step='migration'; await fixture.guard();cli('validate');cli('migrate','deploy');cli('generate');
  const {PrismaClient}=await import(pathToFileURL(path.join(fixture.run,'client/index.js')).href);
  prisma=new PrismaClient({adapter:createPrismaAdapter(fixture.connectionString)});
  // Diagnostics de concurrence sans requête SQL, contenu, identifiant ni secret.
  const transactionDiagnostics=[],transaction=prisma.$transaction.bind(prisma);
  prisma.$transaction=async(...args)=>{try{return await transaction(...args);}catch(error){
    transactionDiagnostics.push({step,code:error.code||error.name,metaCode:error.meta?.code,driverKind:error.meta?.driverAdapterError?.cause?.kind||error.cause?.kind,originalCode:error.meta?.driverAdapterError?.cause?.originalCode||error.cause?.originalCode});
    writeFileSync(path.join(fixture.run,'transaction-diagnostics.json'),JSON.stringify(transactionDiagnostics,null,2));throw error;
  }};
  assert.equal((await fixture.sql('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL')).rows[0].n,15);
  cli('migrate','diff','--from-config-datasource','--to-schema',schemaPath,'--exit-code');
  pass('migration SQL réelle appliquée ; schéma valide et client isolé généré');
  if(process.argv.includes('--elearning')) {
    await fixture.sql(readFileSync(path.join(backend,'prisma/rollbacks/20261111180000_videos_pedagogiques.sql'),'utf8'));
    await fixture.sql(readFileSync(path.join(backend,'prisma/rollbacks/20261111160000_contenu_pedagogique.sql'),'utf8'));
    await fixture.sql(readFileSync(path.join(backend,'prisma/migrations/20261111160000_contenu_pedagogique/migration.sql'),'utf8'));
    await fixture.sql(readFileSync(path.join(backend,'prisma/migrations/20261111180000_videos_pedagogiques/migration.sql'),'utf8'));
    cli('migrate','diff','--from-config-datasource','--to-schema',schemaPath,'--exit-code');
    pass('pédagogie : retour arrière vide puis réapplication SQL sans divergence');
  }
  if(process.argv.includes('--attestations')) {
    await fixture.sql(readFileSync(path.join(backend,'prisma/rollbacks/20261111120000_attestations.sql'),'utf8'));
    await fixture.sql(readFileSync(path.join(backend,'prisma/migrations/20261111120000_attestations/migration.sql'),'utf8'));
    cli('migrate','diff','--from-config-datasource','--to-schema',schemaPath,'--exit-code');
    pass('attestations : rollback sur tables vides puis réapplication SQL réelle sans divergence');
  }
  const hash=await hashPassword(password);
  const admin=await createFirstAdmin(prisma,' ADMIN@AUTH-TEST.INVALID ',password);
  await assert.rejects(()=>createFirstAdmin(prisma,'second@auth-test.invalid',password),e=>e.message==='ADMIN_EXISTS');
  pass('fonction du script local testée : premier administrateur créé, second refusé');
  const member=await prisma.utilisateur.create({data:{email:'member@auth-test.invalid',motDePasseHash:hash,role:'MEMBRE'}});
  await prisma.utilisateur.create({data:{email:'inactive@auth-test.invalid',motDePasseHash:hash,role:'ADMIN',actif:false}});
  await assert.rejects(()=>prisma.utilisateur.create({data:{email:admin.email,motDePasseHash:hash}}),e=>e.code==='P2002');
  await assert.rejects(()=>fixture.sql('UPDATE "Utilisateur" SET email=$1 WHERE id=$2',['ADMIN@auth-test.invalid',admin.id]),e=>e.code==='23514');
  assert(hash.startsWith('$argon2id$'));pass('comptes fictifs isolés, email normalisé/unique et hash Argon2id');
  await prisma.formation.create({data:{titre:'Publique test',description:'Description publique',publiee:true}});
  await prisma.formation.create({data:{titre:'Brouillon test',publiee:false}});
  step='API';await start();
  const anon=client();assert.equal((await anon.request('/api/admin/moi')).status,401);
  const c=client();const csrfResponse=await c.token();
  const cookieHeader=csrfResponse.headers.getSetCookie()[0];
  assert(cookieHeader.includes('HttpOnly')&&cookieHeader.includes('SameSite=Lax')&&!cookieHeader.includes('Secure'));
  assert.equal(csrfResponse.headers.get('cache-control'),'no-store');
  const preCookie=c.cookie, preCsrf=c.csrf;
  assert.equal((await c.request('/api/auth/connexion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:admin.email,password})})).status,403);
  assert.equal((await c.request('/api/auth/connexion',{method:'POST',headers:{Origin:'https://evil.invalid','x-csrf-token':c.csrf}})).status,403);
  const wrong=await c.login(admin.email,'mauvais-mot-de-passe');assert.equal(wrong.status,401);const generic=await wrong.json();
  const unknown=await c.login('absent@auth-test.invalid');assert.equal(unknown.status,401);assert.deepEqual(await unknown.json(),generic);
  const inactive=await c.login('inactive@auth-test.invalid');assert.equal(inactive.status,401);assert.deepEqual(await inactive.json(),generic);
  const valid=await c.login(' ADMIN@AUTH-TEST.INVALID ');assert.equal(valid.status,200);
  const body=await valid.json();c.csrf=body.csrfToken;
  assert.deepEqual(Object.keys(body.user).sort(),['email','id','role']);
  assert(!JSON.stringify(body).includes(hash)&&!JSON.stringify(body).includes(password));
  assert.notEqual(c.cookie,preCookie);assert.notEqual(c.csrf,preCsrf);
  const replay=client();replay.cookie=preCookie;assert.equal((await replay.request('/api/admin/moi')).status,401);
  assert.equal((await c.request('/api/admin/moi')).status,200);
  pass('connexion normalisée valide ; erreurs génériques ; anonyme/inactif refusés ; rotation cookie et CSRF');
  const m=client();assert.equal((await m.login(member.email)).status,200);assert.equal((await m.request('/api/admin/moi')).status,403);
  await prisma.utilisateur.update({where:{id:admin.id},data:{role:'MEMBRE'}});assert.equal((await c.request('/api/admin/moi')).status,403);
  await prisma.utilisateur.update({where:{id:admin.id},data:{role:'ADMIN',actif:false}});assert.equal((await c.request('/api/admin/moi')).status,401);
  await prisma.utilisateur.update({where:{id:admin.id},data:{actif:true}});
  pass('403 sans rôle autorisé ; rôle et état actif relus pour chaque requête');
  await c.login();
  await stop();await start();assert.equal((await c.request('/api/admin/moi')).status,200);
  pass('session conservée en PostgreSQL après redémarrage du serveur');
  assert.equal((await c.request('/api/auth/deconnexion',{method:'POST'})).status,403);
  await c.token();assert.equal((await c.request('/api/auth/deconnexion',{method:'POST',headers:{'x-csrf-token':preCsrf}})).status,403);
  assert.equal((await c.request('/api/auth/deconnexion',{method:'POST',headers:{Origin:'https://evil.invalid','x-csrf-token':c.csrf}})).status,403);
  const liveCookie=c.cookie;
  assert.equal((await c.request('/api/auth/deconnexion',{method:'POST',headers:{'x-csrf-token':c.csrf}})).status,204);
  c.cookie=liveCookie;assert.equal((await c.request('/api/admin/moi')).status,401);
  assert.equal((await fixture.sql('SELECT count(*)::int AS n FROM "AuthSession" WHERE sess->>\'userId\'=$1',[admin.id])).rows[0].n,0);
  pass('déconnexion protégée CSRF/origine et session réellement supprimée ; rejeu du cookie refusé');
  await c.login();await fixture.sql('UPDATE "AuthSession" SET expire=(now() AT TIME ZONE \'UTC\')-interval \'1 second\' WHERE sess->>\'userId\'=$1',[admin.id]);
  assert.equal((await c.request('/api/admin/moi')).status,401);
  await c.login();await fixture.sql('UPDATE "AuthSession" SET sess=jsonb_set(sess::jsonb,\'{authExpiresAt}\',\'0\')::json WHERE sess->>\'userId\'=$1',[admin.id]);
  assert.equal((await c.request('/api/admin/moi')).status,401);
  await c.login();await fixture.sql('DELETE FROM "AuthSession" WHERE sess->>\'userId\'=$1',[admin.id]);
  assert.equal((await c.request('/api/admin/moi')).status,401);
  pass('expiration PostgreSQL, expiration absolue et révocation refusées');
  const rate=client();let limited;
  for(let n=0;n<9;n++) limited=await rate.login('rate@auth-test.invalid','incorrect');
  assert.equal(limited.status,429);assert.deepEqual(await limited.json(),generic);
  pass('limitation par email après huit échecs, message générique et HTTP 429');
  await stop();await start({loginLimits:{ip:2,email:8}});
  const ip=client();await ip.login('ip1@auth-test.invalid');await ip.login('ip2@auth-test.invalid');
  assert.equal((await ip.login('ip3@auth-test.invalid')).status,429);pass('limitation par IP indépendamment de l’adresse email');
  await stop();await start({production:true,origins:['https://academy.invalid'],trustedProxy:'loopback'});
  const secure=await fetch(base+'/api/auth/csrf',{headers:{'X-Forwarded-Proto':'https'}});
  const prodCookie=secure.headers.getSetCookie()[0];
  assert(prodCookie.startsWith('__Host-cmh.sid=')&&prodCookie.includes('Secure')&&prodCookie.includes('HttpOnly')&&prodCookie.includes('SameSite=Lax'));
  pass('cookie production __Host-, Secure, HttpOnly et SameSite');
  await stop();await start();
  const catalog=await fetch(base+'/api/formations');assert.equal(catalog.status,200);
  const data=await catalog.json();assert.equal(data.formations.length,1);assert.deepEqual(Object.keys(data.formations[0]).sort(),['description','id','titre']);
  assert.equal((await fetch(base+'/api/auth/inscription',{method:'POST'})).status,404);
  pass('catalogue public inchangé, brouillons cachés et aucune inscription publique');
  if(process.argv.includes('--catalogue')) {
    step='administration catalogue';
    const {testAdminCatalogue}=await import('./lib/test-admin-catalogue.mjs');
    await testAdminCatalogue({prisma,client,pass});
  }
  if(process.argv.includes('--formations')) {
    step='administration formations';
    const {testFormations}=await import('./lib/test-formations.mjs');
    await testFormations({prisma,client,pass});
  }
  if(process.argv.includes('--sessions')) {
    step='administration sessions';
    const {testSessions}=await import('./lib/test-sessions.mjs');
    await testSessions({prisma,client,pass});
  }
  if(process.argv.includes('--public')) {
    step='catalogue public';
    const {testPublicCatalogue}=await import('./lib/test-public-catalogue.mjs');
    await testPublicCatalogue({prisma,client,pass});
  }
  if(process.argv.includes('--inscriptions')) {
    step='préinscriptions';
    const {testInscriptions}=await import('./lib/test-inscriptions.mjs');
    await testInscriptions({prisma,client,pass});
  }
  if(process.argv.includes('--stress-inscriptions')) {
    step='stress confirmations concurrentes';const c=client();await c.login();await c.token();
    const f=await prisma.formation.create({data:{titre:'Stress concurrence isolé'}});
    for(let n=0;n<30;n++){
      const s=await prisma.session.create({data:{formationId:f.id,capacite:1}});
      const rows=await Promise.all([0,1].map(i=>prisma.inscription.create({data:{sessionId:s.id,email:`stress-${n}-${i}@test.invalid`,prenom:'Test',nom:'Concurrence',typeDemande:'PARTICULIER'}})));
      const responses=await Promise.all(rows.map(i=>c.request('/api/admin/inscriptions/'+i.id+'/statut',{method:'PUT',headers:{'Content-Type':'application/json','x-csrf-token':c.csrf},body:JSON.stringify({statut:'CONFIRMEE',statutAttendu:'EN_ATTENTE'})})));
      assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);assert.equal(await prisma.inscription.count({where:{sessionId:s.id,statut:'CONFIRMEE'}}),1);
    }
    pass('30 dernières places validées simultanément : une confirmation et un refus de capacité à chaque fois');
  }
  if(process.argv.includes('--dossiers')) {
    step='dossiers administratifs';
    await stop();await start();
    const {testDossiers}=await import('./lib/test-dossiers.mjs');
    await testDossiers({prisma,client,pass});
  }
  if(process.argv.includes('--documents')) {
    step='pièces jointes';
    const {testDocuments}=await import('./lib/test-documents.mjs');
    await testDocuments({prisma,client,pass,base,storageRoot:path.join(fixture.run,'documents'),run:fixture.run,
      restart:async options=>{await stop();await start(options);}});
  }
  if(process.argv.includes('--stagiaires')) {
    step='espace stagiaire';
    const {testStagiaires}=await import('./lib/test-stagiaires.mjs');
    await testStagiaires({prisma,client,pass,run:fixture.run,restart:async options=>{await stop();await start(options);}});
  }
  if(process.argv.includes('--questionnaires')) {
    step='questionnaires';
    const {testQuestionnaires}=await import('./lib/test-questionnaires.mjs');
    await testQuestionnaires({prisma,client,pass,run:fixture.run});
  }
  if(process.argv.includes('--presences')) {
    step='présences';
    const {testPresences}=await import('./lib/test-presences.mjs');
    await testPresences({prisma,client,pass,run:fixture.run});
  }
  if(process.argv.includes('--attestations')) {
    step='attestations';
    const {testAttestations}=await import('./lib/test-attestations.mjs');
    await testAttestations({prisma,client,pass,run:fixture.run,fixture,restart:async options=>{await stop();await start(options);}});
  }
  if(process.argv.includes('--elearning')) {
    step='contenu pédagogique';
    const {testElearning}=await import('./lib/test-elearning.mjs');
    await testElearning({prisma,client,pass,run:fixture.run,fixture,restart:async options=>{await stop();await start(options);}});
  }
  if(process.argv.includes('--videos')) {
    step='vidéos pédagogiques';
    const {testVideos}=await import('./lib/test-videos.mjs');
    await testVideos({prisma,client,pass,run:fixture.run,fixture,getBase:()=>base,restart:async options=>{await stop();await start(options);}});
  }
  if(process.argv.includes('--suivi-documents')) {
    step='suivi documentaire stagiaire';
    const {testSuiviDocuments}=await import('./lib/test-suivi-documents.mjs');
    await testSuiviDocuments({prisma,client,pass,run:fixture.run,getBase:()=>base});
  }
  if(process.argv.includes('--browser')||process.argv.includes('--video-browser')||process.argv.includes('--documents-browser')) {
    step='navigateur';
    const frontend=path.resolve(backend,'../frontend');const require=createRequire(path.join(frontend,'package.json'));
    const {createServer}=await import(pathToFileURL(require.resolve('vite')).href);
    const {default:react}=await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);
    vite=await createServer({configFile:false,root:frontend,plugins:[react()],server:{fs:{allow:[frontend,path.resolve(backend,'../shared')]},host:'127.0.0.2',port:0,proxy:{'/api':{target:base,changeOrigin:true}}}});await vite.listen();
    const browserOrigin=`http://127.0.0.2:${vite.httpServer.address().port}`;
    await stop();await start({origins:[origin,browserOrigin]});
    // Le proxy a gardé l'ancien port : mise à jour avant le premier accès navigateur.
    const testFailures={name:'isolated-public-failures',configureServer(server){server.middlewares.use((req,res,next)=>{
      if(existsSync(path.join(fixture.run,'simulate-public-error')) && (req.url?.startsWith('/api/catalogue/formations')||req.url?.startsWith('/api/formations/'))){res.statusCode=503;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({error:'Indisponibilité de test isolé.'}));return;}
      next();
    });}};
    await vite.close();vite=await createServer({configFile:false,root:frontend,plugins:[react(),testFailures],server:{fs:{allow:[frontend,path.resolve(backend,'../shared')]},host:'127.0.0.2',port:Number(new URL(browserOrigin).port),strictPort:true,proxy:{'/api':{target:base,changeOrigin:true}}}});await vite.listen();
    writeFileSync(path.join(fixture.run,'browser.json'),JSON.stringify({email:admin.email,password,origin:browserOrigin}),{mode:0o600});
    console.log(`NAVIGATEUR ${browserOrigin}/admin/connexion`);console.log(`DOSSIER ${fixture.run}`);
    if(process.argv.includes('--documents-browser')) {
      const {testDocumentsBrowser}=await import('./lib/test-documents-browser.mjs');
      await testDocumentsBrowser({origin:browserOrigin,run:fixture.run,adminEmail:admin.email,adminPassword:password,pass,prisma});
    } else if(process.argv.includes('--video-browser')) {
      const {testVideosBrowser}=await import('./lib/test-videos-browser.mjs');
      await testVideosBrowser({origin:browserOrigin,run:fixture.run,adminEmail:admin.email,adminPassword:password,pass,prisma});
    } else while(!existsSync(path.join(fixture.run,'stop-browser'))) await new Promise(resolve=>setTimeout(resolve,500));
  }
} catch(error) {
  console.error(`FAIL étape ${step} : ${error.code || error.name} (détails et secrets masqués).`);process.exitCode=1;
  const frame = error.stack?.split('\n').find(line => /^\s+at .*\/scripts\//.test(line));
  if (frame) console.error(frame);
} finally {
  if(vite) await vite.close();await stop();if(prisma) await prisma.$disconnect();
  if(fixture) {await fixture.close();writeFileSync(path.join(fixture.run,'auth-results.json'),JSON.stringify({success:!process.exitCode,results},null,2));console.log(`Résultats : ${path.join(fixture.run,'auth-results.json')}`);}
}
