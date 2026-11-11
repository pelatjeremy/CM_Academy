import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,createHash} from 'node:crypto';
import {ffmpegPath,ffprobePath} from 'ffmpeg-ffprobe-static';
import {isolatedDb,backend} from './lib/isolated-db.mjs';
import {createPrismaAdapter} from '../lib/prisma-adapter.js';
import {createApp} from '../app.js';
import {demoTarget} from '../lib/demo-target.js';
import {prepareDemoAssets} from './lib/demo-assets.mjs';
import {seedDemo,demoIds} from './lib/seed-demo.mjs';
import {createDocumentStorage} from '../lib/documents.js';
import {preparerAttestation} from '../lib/attestations.js';
import {genererAttestation} from '../lib/attestation-pdf.js';

let fixture,prisma,instance,server,base;const results=[];
const pass=message=>{results.push(message);console.log('PASS '+message);};
const passwords={admin:randomBytes(24).toString('base64url'),student:randomBytes(24).toString('base64url'),other:randomBytes(24).toString('base64url')},secret=randomBytes(48).toString('hex');
const origin='https://demo.example.invalid';
async function start(){instance=await createApp({prisma,connectionString:fixture.connectionString,sessionSecret:secret,production:true,trustedProxy:'loopback',origins:[origin],demo:true,frontendDir:path.resolve(backend,'../frontend/dist'),documentStorage:{root:path.join(fixture.run,'private')}});server=instance.app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
async function stop(){if(server){server.closeAllConnections();await new Promise(r=>server.close(r));server=null;}await instance?.close();instance=null;}
function client(){return {cookie:'',csrf:'',async request(route,options={}){const response=await fetch(base+route,{...options,headers:{Origin:origin,'X-Forwarded-Proto':'https',...(this.cookie?{Cookie:this.cookie}:{}),...options.headers}});const cookies=response.headers.getSetCookie();if(cookies.length)this.cookie=cookies[0].split(';')[0];return response;},async write(route,body,method='POST'){this.csrf=(await(await this.request('/api/auth/csrf')).json()).csrfToken;return this.request(route,{method,headers:{'Content-Type':'application/json','x-csrf-token':this.csrf},body:JSON.stringify(body)});},async login(email,password){const response=await this.write('/api/auth/connexion',{email,password});assert.equal(response.status,200);assert(this.cookie.startsWith('__Host-cmh.sid='));return response;}};}
const digest=buffer=>createHash('sha256').update(buffer).digest('hex');
try{
 assert.throws(()=>demoTarget({DEMO_MODE:'true',DEMO_DATABASE_NAME:'cmh_academy_dev',DATABASE_URL:'postgresql://localhost/cmh_academy_dev',DOCUMENT_STORAGE_DIR:path.resolve('.')}));
 fixture=await isolatedDb({namePrefix:'cmh_academy_demo'});
 const schema=path.join(fixture.run,'schema.prisma');writeFileSync(schema,readFileSync(path.join(backend,'prisma/schema.prisma'),'utf8').replace('provider = "prisma-client-js"','provider = "prisma-client-js"\n output = "./client"'));
 const config=path.join(fixture.run,'prisma.config.ts');writeFileSync(config,`import {defineConfig,env} from 'prisma/config';export default defineConfig({schema:${JSON.stringify(schema)},migrations:{path:${JSON.stringify(path.join(backend,'prisma/migrations'))}},datasource:{url:env('DEMO_TEST_URL')}});`);
 const cli=(...args)=>fixture.command(process.execPath,[path.join(backend,'node_modules/prisma/build/index.js'),...args,'--config',config],{DEMO_TEST_URL:fixture.connectionString});cli('migrate','deploy');cli('generate');cli('migrate','diff','--from-config-datasource','--to-schema',schema,'--exit-code');
 const {PrismaClient}=await import(pathToFileURL(path.join(fixture.run,'client/index.js')).href);prisma=new PrismaClient({adapter:createPrismaAdapter(fixture.connectionString)});
 process.env.VIDEO_FFPROBE_PATH=ffprobePath;
 const root=path.join(fixture.run,'private'),assets=await prepareDemoAssets(path.join(fixture.run,'.demo-assets'),ffmpegPath);
 assert((await seedDemo({prisma,root,assets,passwords})).created);assert.equal((await seedDemo({prisma,root,assets,passwords})).created,false);
 assert.equal(await prisma.utilisateur.count(),3);assert.equal(await prisma.inscription.count(),2);assert.equal(await prisma.leconPedagogique.count(),3);assert.equal(await prisma.videoLecon.count(),1);assert.equal((await prisma.progressionLecon.findMany()).length,1);
 pass('garde anti-base de développement, quatorze migrations isolées, jeu fictif complet et initialisation idempotente sans écrasement');
 await start();const admin=client(),student=client(),other=client(),anon=client();
 const conf=await(await anon.request('/api/configuration-publique')).json();assert.deepEqual(conf,{demonstration:true});
 for(const url of ['/formations','/formations/observer-le-cheval-demonstration','/admin','/stagiaire']){const r=await anon.request(url);assert.equal(r.status,200);assert((await r.text()).includes('/assets/'));assert(r.headers.get('content-security-policy').includes("frame-ancestors 'none'"));}
 for(const url of ['/.env','/backend/.env','/shared/format-fr.mjs','/.demo-secrets/access.json','/.private-documents/objets/secret.blob','/api/inconnue'])assert.equal((await anon.request(url)).status,404);
 assert.equal((await anon.write('/api/sessions/demo-session-prochaine/preinscriptions',{})).status,403);assert.equal(await prisma.inscription.count(),2);
 pass('frontend de production, mention publique minimale, fichiers privés non servis, CSP et demandes publiques désactivées sur démonstration');
 await admin.login('administration@demo.invalid',passwords.admin);await student.login('alice@demo.invalid',passwords.student);await other.login('leo@demo.invalid',passwords.other);
 const tree=await(await admin.request('/api/admin/formations/'+demoIds.formation+'/contenu')).json();assert.equal(tree.modules.length,2);assert(tree.videoProbe.available);
 const demoState=await(await admin.request('/api/admin/demonstration/etat')).json();assert.equal(demoState.migrations.terminees,14);assert(demoState.migrations.empreintesConformes);assert.equal(demoState.fichiersReferences,3);assert(Object.values(demoState.audit).every(n=>n===0));assert.equal((await anon.request('/api/admin/demonstration/etat')).status,401);assert.equal((await student.request('/api/admin/demonstration/etat')).status,403);
 const publicBody=await(await anon.request('/api/formations/observer-le-cheval-demonstration')).text();for(const privateValue of ['stockageKey','alice@demo.invalid','demo-inscription','motDePasseHash',passwords.admin,'transcription'])assert(!publicBody.includes(privateValue));
 const prefix='/api/stagiaire/inscriptions/'+demoIds.inscription,video=prefix+'/parcours/lecons/'+demoIds.lesson+'/videos/'+demoIds.video+'/lecture',pdf=prefix+'/fichiers/'+demoIds.pdf+'/telecharger';
 for(const [c,status]of [[anon,401],[other,404],[admin,403]])for(const method of ['GET','HEAD'])assert.equal((await c.request(video,{method,headers:{Range:'bytes=0-9'}})).status,status);
 assert.equal((await anon.request(pdf)).status,401);assert.equal((await other.request(pdf)).status,404);
 const part=await student.request(video,{headers:{Range:'bytes=100-109'}});assert.equal(part.status,206);assert.equal((await part.arrayBuffer()).byteLength,10);
 const full=Buffer.from(await(await student.request(video)).arrayBuffer()),doc=Buffer.from(await(await student.request(pdf)).arrayBuffer());assert(full.length>1000);assert.equal(doc.subarray(0,5).toString(),'%PDF-');
 pass('connexions avec cookies Secure, confidentialité publique, PDF protégé, streaming MP4 et isolation de deux stagiaires');
 const progression=prefix+'/parcours/lecons/'+demoIds.lesson+'/progression';assert.equal((await(await student.request(prefix+'/parcours')).json()).progression.terminees,1);
 assert.equal((await student.write(progression,{terminee:true,revision:null},'PUT')).status,200);
 await stop();await start();assert.equal((await(await student.request(prefix+'/parcours')).json()).progression.terminees,2);
 assert.equal(digest(Buffer.from(await(await student.request(video)).arrayBuffer())),digest(full));assert.equal(digest(Buffer.from(await(await student.request(pdf)).arrayBuffer())),digest(doc));
 pass('déclaration explicite de progression et conservation des sessions, données et PDF/vidéo après redémarrage applicatif');
 const preview=await preparerAttestation(prisma,demoIds.inscription);assert.equal(preview.donnees.dureeProgrammeeMs,14*3600000);assert.equal(preview.donnees.dureeSuivieMs,12*3600000);
 writeFileSync(path.join(fixture.run,'attestation-demo.pdf'),await genererAttestation(preview.donnees,{brouillon:true}));
 assert.deepEqual(await createDocumentStorage({root}).audit(prisma,{ageMs:0}),{temporaires:[],orphelins:[],manquants:[],alteres:[],inconnus:0,temporairesNettoyes:0});assert.equal(readdirSync(path.join(root,'objets')).length,3);
 assert.equal((await student.write('/api/auth/deconnexion',{})).status,204);assert.equal((await student.request(video)).status,401);
 pass('PDF d’aperçu 14 h programmées/12 h renseignées, audit commun propre, déconnexion révoquant la lecture');
}catch(error){process.exitCode=1;console.error('FAIL démonstration : '+(error.code||error.name));const frame=error.stack?.split('\n').find(line=>line.includes('test-demo.mjs:')||line.includes('seed-demo.mjs:'));if(frame)console.error(frame);if(fixture)writeFileSync(path.join(fixture.run,'demo-error-private.json'),JSON.stringify({message:error.message,stack:error.stack},null,2));}
finally{await stop();await prisma?.$disconnect();if(fixture){await fixture.close();writeFileSync(path.join(fixture.run,'demo-results.json'),JSON.stringify({success:!process.exitCode,results},null,2));console.log('RAPPORT '+path.join(fixture.run,'demo-results.json'));}}
