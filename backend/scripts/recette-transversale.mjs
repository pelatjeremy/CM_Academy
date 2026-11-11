import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,lstatSync,existsSync,unlinkSync} from 'node:fs';
import path from 'node:path';
import {parseEnv} from 'node:util';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {Client} from 'pg';
import PDFDocument from 'pdfkit';
import {isolatedDb,backend} from './lib/isolated-db.mjs';
import {createPrismaAdapter} from '../lib/prisma-adapter.js';
import {createFirstAdmin} from '../auth/provision-admin.js';
import {createApp} from '../app.js';
import {createDocumentStorage} from '../lib/documents.js';
import {parisInput} from '../admin/paris-time.js';

// Aucun chargement de .env dans le processus applicatif isolé.
// La seule connexion locale est explicitement en lecture seule pour ses empreintes.
const hash=b=>createHash('sha256').update(b).digest('hex');
async function localSignature(){
 const variables=parseEnv(readFileSync(path.join(backend,'.env'),'utf8')),u=new URL(variables.DATABASE_URL);
 assert(['localhost','127.0.0.1','[::1]'].includes(u.hostname));assert.equal(u.port||'5432','5432');assert.equal(u.pathname,'/cmh_academy_dev');
 const db=new Client({connectionString:u.href});const result={tables:{},fichiers:[]};
 try{await db.connect();await db.query('BEGIN READ ONLY');
  const identity=(await db.query('SELECT current_database() AS db,host(inet_server_addr()) AS host,inet_server_port() AS port')).rows[0];assert.equal(identity.db,'cmh_academy_dev');assert.equal(identity.port,5432);assert(['127.0.0.1','::1'].includes(identity.host));
  const tables=(await db.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'AuthSession' ORDER BY tablename")).rows;
  for(const {tablename:t} of tables){assert(/^[A-Za-z_]+$/.test(t));const rows=(await db.query('SELECT * FROM "'+t+'" ORDER BY row_to_json("'+t+'")::text COLLATE "C"')).rows;result.tables[t]={count:rows.length,sha256:hash(JSON.stringify(rows))};}
  await db.query('COMMIT');
 }finally{await db.end();}
 const root=path.resolve(backend,variables.DOCUMENT_STORAGE_DIR||'.private-documents');
 function visit(rel=''){for(const name of readdirSync(path.join(root,rel)).sort()){const p=path.join(rel,name),f=path.join(root,p),s=lstatSync(f);assert(!s.isSymbolicLink());if(s.isDirectory())visit(p);else result.fichiers.push({path:p,sha256:hash(readFileSync(f)),size:s.size});}}
 if(existsSync(root))visit();return result;
}

let fixture,prisma,instance,server,vite,PrismaClient,apiBase,apiPort,browserOrigin;
let step='préparation';const results=[],browser=process.argv.includes('--browser');
const wallAnchor=new Date(),day=86400000;
const first=new Date(Date.UTC(wallAnchor.getUTCFullYear(),wallAnchor.getUTCMonth(),wallAnchor.getUTCDate()-5,8));
let testNow=new Date(first.getTime()-day);
const after=new Date(wallAnchor.getTime()+3600000);
const clock=()=>new Date(testNow);
const password=randomBytes(24).toString('base64url'),stagiairePassword=randomBytes(24).toString('base64url'),sessionSecret=randomBytes(48).toString('hex');
const origin='http://127.0.0.2:5173';
const pass=label=>{results.push({etape:label,horlogeMetier:testNow.toISOString()});console.log('PASS '+label);};
const report=()=>writeFileSync(path.join(fixture.run,'recette-results.json'),JSON.stringify({success:!process.exitCode,results,horloge:{avant:first.toISOString(),preparation:new Date(first.getTime()-day).toISOString(),apres:after.toISOString(),authentificationEtAuditSql:'horloge réelle conservée'},scope:'cluster et stockage isolés ; aucun accès en écriture à cmh_academy_dev'},null,2));
async function stopApi(){if(server)await new Promise(r=>server.close(r));server=undefined;if(instance)await instance.close();instance=undefined;}
async function startApi(){
 await fixture.guard();instance=await createApp({prisma,connectionString:fixture.connectionString,sessionSecret,origins:[origin,...(browserOrigin?[browserOrigin]:[])],documentStorage:{root:path.join(fixture.run,'documents')},clock});
 server=instance.app.listen(apiPort||0,'127.0.0.2');await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});apiPort=server.address().port;apiBase='http://127.0.0.2:'+apiPort;
}
function client(){return {cookie:'',csrf:'',async request(url,options={}){const response=await fetch(apiBase+url,{...options,headers:{Origin:origin,...(this.cookie?{Cookie:this.cookie}:{}),...options.headers}});const set=response.headers.getSetCookie();if(set.length)this.cookie=set[0].split(';')[0];return response;},async token(){const r=await this.request('/api/auth/csrf');assert.equal(r.status,200);this.csrf=(await r.json()).csrfToken;},async login(email,secret){return api(this,'/api/auth/connexion',{email,password:secret},200);}};}
async function api(c,url,body,status=200,method=body===undefined?'GET':'POST'){
 if(!['GET','HEAD'].includes(method))await c.token();
 const r=await c.request(url,{method,...(body!==undefined?{body:JSON.stringify(body)}:{}),headers:{'Content-Type':'application/json',...(!['GET','HEAD'].includes(method)?{'x-csrf-token':c.csrf}:{})}});
 assert.equal(r.status,status,`${step} : statut attendu ${status}, reçu ${r.status}`);return r.status===204?null:r.json();
}
async function startBrowser(){
 const frontend=path.resolve(backend,'../frontend'),require=createRequire(path.join(frontend,'package.json'));
 const {createServer}=await import(pathToFileURL(require.resolve('vite')).href),{default:react}=await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href);
 vite=await createServer({configFile:false,root:frontend,plugins:[react()],server:{host:'127.0.0.2',port:0,proxy:{'/api':{target:apiBase,changeOrigin:true}}}});await vite.listen();
 browserOrigin='http://127.0.0.2:'+vite.httpServer.address().port;
 await stopApi();await startApi();
 writeFileSync(path.join(fixture.run,'browser.json'),JSON.stringify({origin:browserOrigin,adminEmail:'admin@recette.invalid',password,stagiaireEmail:'eleonore@recette.invalid',stagiairePassword}),{mode:0o600});
 console.log('NAVIGATEUR '+browserOrigin+'/formations');console.log('DOSSIER '+fixture.run);
}
async function pause(name,metadata){writeFileSync(path.join(fixture.run,'etape-navigateur.json'),JSON.stringify({etape:name,...metadata},null,2));console.log('PAUSE '+name);while(!existsSync(path.join(fixture.run,name+'.continuer'))){if(existsSync(path.join(fixture.run,'stop-browser')))throw new Error('RECETTE_ARRETEE');await new Promise(r=>setTimeout(r,300));}await fixture.guard();}
async function programmePdf(version,titre){const pdf=new PDFDocument({size:'A4',margin:56});const chunks=[];const done=new Promise((resolve,reject)=>{pdf.on('data',b=>chunks.push(b));pdf.on('end',()=>resolve(Buffer.concat(chunks)));pdf.on('error',reject);});pdf.font(fileURLToPath(new URL('../assets/fonts/Vera.ttf',import.meta.url))).fontSize(20).text('Programme de formation').moveDown().fontSize(12).text(titre).moveDown().text('Version '+version+' - quatre séances de 3 h 30.\nObservation, préparation, mise en pratique et synthèse.');pdf.end();return done;}
async function snapshot(){const data={};for(const table of ['Formation','Session','Seance','Inscription','DossierAdministratif','ElementDocumentaire','PieceJointe','InvitationStagiaire','RattachementStagiaire','QuestionnaireAttribue','Presence','ChangementPresence','AttestationEmission','PartagePieceJointe']){const rows=await prisma.$queryRawUnsafe('SELECT * FROM "'+table+'" ORDER BY row_to_json("'+table+'")::text COLLATE "C"');data[table]=hash(JSON.stringify(rows,(_,v)=>typeof v==='bigint'?v.toString():v));}return data;}
let localBefore;
try{
 localBefore=await localSignature();fixture=await isolatedDb();await fixture.guard();writeFileSync(path.join(fixture.run,'local-avant.json'),JSON.stringify(localBefore,null,2));
 const schemaPath=path.join(fixture.run,'schema.prisma');writeFileSync(schemaPath,readFileSync(path.join(backend,'prisma/schema.prisma'),'utf8').replace('provider = "prisma-client-js"','provider = "prisma-client-js"\n  output = "./client"'));
 const config=path.join(fixture.run,'prisma.config.ts');writeFileSync(config,`import {defineConfig,env} from 'prisma/config';export default defineConfig({schema:${JSON.stringify(schemaPath)},migrations:{path:${JSON.stringify(path.join(backend,'prisma/migrations'))}},datasource:{url:env('RECETTE_DB_URL')}});`);
 const cli=(...args)=>fixture.command(process.execPath,[path.join(backend,'node_modules/prisma/build/index.js'),...args,'--config',config],{RECETTE_DB_URL:fixture.connectionString});
 cli('validate');cli('migrate','deploy');cli('generate');cli('migrate','diff','--from-config-datasource','--to-schema',schemaPath,'--exit-code');
 ({PrismaClient}=await import(pathToFileURL(path.join(fixture.run,'client/index.js')).href));prisma=new PrismaClient({adapter:createPrismaAdapter(fixture.connectionString)});
 assert.equal(await prisma.formation.count(),0);await createFirstAdmin(prisma,'admin@recette.invalid',password);await startApi();
 const admin=client(),alice=client(),bob=client(),publicClient=client();await admin.login('admin@recette.invalid',password);
 step='1 organisme';await api(admin,'/api/admin/organisme-attestation',{revision:0,denomination:'CMH Recette — organisme fictif isolé',adresse:'Adresse fictive réservée à la recette',identifiant:'RECETTE-ISOLÉE',representant:''},200,'PUT');pass(step);
 step='2 catalogue complet';
 const pole=(await api(admin,'/api/admin/poles',{titre:'Bien-être du cheval — recette',slug:'bien-etre-recette',description:'Pôle réservé à la recette isolée.'},201)).item;
 const formateur=(await api(admin,'/api/admin/formateurs',{nom:'Camille Recette',biographie:'Présentation fictive pour la recette.'},201)).item;
 const formationData={titre:'Observer et accompagner le cheval — recette',slug:'observer-accompagner-recette',resume:'Quatre rendez-vous pour observer les besoins du cheval.',description:'Formation de recette : observation et préparation du travail avec le cheval.',objectifs:'Observer les besoins du cheval.\nDécrire une préparation adaptée.',programme:'Observation, préparation, mise en pratique, synthèse.',publicVise:'Professionnels du cheval',prerequis:'Aucun prérequis',dureeMinutes:840,format:'PRESENTIEL',tarif:'280.50',devise:'EUR',financement:'Possibilités soumises aux conditions de l’organisme sollicité.',parcoursDocumentaire:true,poleId:pole.id,formateurIds:[formateur.id]};
 let formation=(await api(admin,'/api/admin/formations',formationData,201)).item;assert(!formation.publiee);assert.equal(formation.tarif,'280.50');assert.deepEqual(formation.formateurIds,[formateur.id]);pass(step);
 step='3 session et quatre séances';
 const schedule=Array.from({length:4},(_,i)=>{const d=parisInput(new Date(first.getTime()+i*day)),f=parisInput(new Date(first.getTime()+i*day+210*60000));return {debutLocal:d.local,finLocal:f.local,debutOffset:d.offset,finOffset:f.offset};});
 const sessionData={formationId:formation.id,capacite:2,lieu:'Salle fictive de recette',modalitesPratiques:'Accueil à la salle de test. Aucun accès privé.',fuseauHoraire:'Europe/Paris',visiblePubliquement:false,preinscriptionsOuvertes:false,seances:schedule};
 let session=(await api(admin,'/api/admin/sessions',sessionData,201)).item;assert.equal(session.totalMinutes,840);assert.equal(session.seances.length,4);pass(step);
 step='4 publication et ouverture';
 formation=(await api(admin,`/api/admin/formations/${formation.id}/publication`,{publiee:true,updatedAt:formation.updatedAt})).item;
 session=(await api(admin,'/api/admin/sessions/'+session.id,{...sessionData,visiblePubliquement:true,preinscriptionsOuvertes:true,updatedAt:session.updatedAt,seances:session.seances.map(s=>({id:s.id,debutLocal:s.debutLocal,finLocal:s.finLocal,debutOffset:s.debutOffset,finOffset:s.finOffset}))},200,'PUT')).item;
 const pub=(await api(publicClient,'/api/formations/'+formation.slug)).formation;assert.equal(pub.sessions[0].preinscriptionSessionId,session.id);pass(step);
 if(browser){await startBrowser();await pause('demande-publique',{slug:formation.slug,sessionId:session.id});}
 step='5 demande professionnelle publique';
 const demande={prenom:'Éléonore',nom:'Recette',email:'eleonore@recette.invalid',typeDemande:'PROFESSIONNEL_FINANCEMENT',organismeEnvisage:'Financeur fictif — accord non acquis'};
 const endpoint='/api/sessions/'+session.id+'/preinscriptions';await api(publicClient,endpoint,demande,202);
 await api(publicClient,endpoint,{...demande,email:' ELEONORE@RECETTE.INVALID '},202);
 const a=await prisma.inscription.findUnique({where:{sessionId_email:{sessionId:session.id,email:demande.email}}});assert(a);assert.equal(a.typeDemande,'PROFESSIONNEL_FINANCEMENT');assert.equal(await prisma.inscription.count({where:{email:demande.email}}),1);pass(step);
 const bobDemande={prenom:'Noé',nom:'Recette distincte',email:'noe@recette.invalid',typeDemande:'PARTICULIER'};await api(publicClient,endpoint,bobDemande,202);const b=await prisma.inscription.findUnique({where:{sessionId_email:{sessionId:session.id,email:bobDemande.email}}});
 step='6 confirmation administrateur';for(const ins of [a,b]){await api(admin,`/api/admin/inscriptions/${ins.id}/statut`,{statut:'CONFIRMEE',statutAttendu:'EN_ATTENTE'},200,'PUT');await api(admin,`/api/admin/inscriptions/${ins.id}/statut`,{statut:'CONFIRMEE',statutAttendu:'EN_ATTENTE'},200,'PUT');assert.equal(await prisma.changementInscription.count({where:{inscriptionId:ins.id}}),2);}pass(step);
 const dossierUrl='/api/admin/inscriptions/'+a.id+'/dossier';
 step='7 dossier unique et configuration';let dossier=(await api(admin,dossierUrl)).item;assert.equal(dossier.id,a.id);assert(dossier.dossier.parcoursDocumentaire);assert.equal(dossier.dossier.elements.length,10);await api(admin,dossierUrl+'/initialiser',{});assert.equal(await prisma.dossierAdministratif.count({where:{inscriptionId:a.id}}),1);
 dossier=(await api(admin,dossierUrl,{updatedAt:dossier.dossier.updatedAt,elements:[{categorie:'PROGRAMME',etat:'EN_ATTENTE',note:'Note interne de recette, privée.'}]},200,'PUT')).item;pass(step);
 step='8 invitations et activation de nouveaux comptes';
 for(const [i,c]of [[a,alice],[b,bob]]){const inv=await api(admin,'/api/admin/inscriptions/'+i.id+'/espace-stagiaire/invitation',{},201);await api(publicClient,'/api/auth/invitations/activer',{token:inv.fragment,password:stagiairePassword});await api(publicClient,'/api/auth/invitations/activer',{token:inv.fragment,password:stagiairePassword},400);await c.login(i.email,stagiairePassword);assert.equal(await prisma.rattachementStagiaire.count({where:{inscriptionId:i.id}}),1);}
 const mine=await api(alice,'/api/stagiaire/inscriptions');assert.deepEqual(mine.items.map(i=>i.id),[a.id]);assert.equal((await bob.request('/api/stagiaire/inscriptions/'+a.id)).status,404);pass(step);
 step='9 deux versions privées et partage explicite';
 const fichiers=dossierUrl+'/elements/PROGRAMME/fichiers';let versions=[];
 for(const v of [1,2]){const data=new FormData();data.append('fichier',new Blob([await programmePdf(v,formation.titre)],{type:'application/pdf'}),'programme-recette-v'+v+'.pdf');await admin.token();const depotId=randomUUID();const upload=()=>admin.request(fichiers,{method:'POST',headers:{'x-csrf-token':admin.csrf,'x-depot-id':depotId,'x-fichier-revision':String(v-1)},body:data});let r=await upload();assert.equal(r.status,201);versions.push((await r.json()).file);r=await upload();assert.equal(r.status,200);}
 assert.equal(await prisma.pieceJointe.count({where:{inscriptionId:a.id,categorie:'PROGRAMME'}}),2);
 const share=(file,partage,revision)=>api(admin,fichiers+'/'+file.id+'/partage',{partage,revision},200,'PUT');await share(versions[0],true,0);pass(step);
 step='10 téléchargement propriétaire et retrait';
 const studentFile=id=>`/api/stagiaire/inscriptions/${a.id}/fichiers/${id}/telecharger`;
 const v1=await alice.request(studentFile(versions[0].id));assert.equal(v1.status,200);assert(hash(Buffer.from(await v1.arrayBuffer()))===(await prisma.pieceJointe.findUnique({where:{id:versions[0].id}})).empreinte);
 assert.equal((await alice.request(studentFile(versions[1].id))).status,404);assert.equal((await bob.request(studentFile(versions[0].id))).status,404);
 await share(versions[0],false,1);assert.equal((await alice.request(studentFile(versions[0].id))).status,404);await share(versions[0],true,2);pass(step);
 step='11 questionnaire figé, brouillon et soumission';
 const questions=['TEXTE_COURT','TEXTE_LONG','CHOIX_UNIQUE','CHOIX_MULTIPLE','NOTE'].map((type,i)=>({id:randomUUID(),type,libelle:['Votre objectif professionnel','Décrivez vos attentes','Votre pratique actuelle','Vos centres d’intérêt','Votre satisfaction de 1 à 5'][i],obligatoire:true,choix:type.startsWith('CHOIX')?[{id:randomUUID(),libelle:'Observation'},{id:randomUUID(),libelle:'Préparation'}]:[]}));
 const modele=(await api(admin,'/api/admin/questionnaires/modeles',{titre:'Bilan nominatif — recette',categorie:'POSITIONNEMENT',questions},201)).item;await api(admin,'/api/admin/questionnaires/modeles/'+modele.id+'/valider',{revision:0});const modelItem=(await api(admin,'/api/admin/questionnaires/modeles/'+modele.id)).item;
 const attribution={modeleId:modele.id,modeleRevision:modelItem.revision,requeteId:randomUUID()},qurl='/api/admin/inscriptions/'+a.id+'/questionnaires';const q=(await api(admin,qurl,attribution,201)).item;await api(admin,qurl,attribution,201);assert.equal(await prisma.questionnaireAttribue.count({where:{inscriptionId:a.id}}),1);
 const reponses=Object.fromEntries(questions.map(q=>[q.id,q.type==='NOTE'?5:q.type==='CHOIX_UNIQUE'?q.choix[0].id:q.type==='CHOIX_MULTIPLE'?[q.choix[0].id,q.choix[1].id]:q.type==='TEXTE_COURT'?'Mieux observer le cheval':'Construire une démarche progressive adaptée à mon activité.']));const responseUrl='/api/stagiaire/inscriptions/'+a.id+'/questionnaires/'+q.id;
 await api(alice,responseUrl+'/soumettre',{revision:0,reponses:{}},422);await api(alice,responseUrl+'/brouillon',{revision:0,reponses},200,'PUT');await api(alice,responseUrl+'/soumettre',{revision:1,reponses});await api(alice,responseUrl+'/soumettre',{revision:1,reponses});assert.equal((await api(alice,responseUrl)).item.revision,2);assert.equal((await bob.request(responseUrl)).status,404);pass(step);
 step='12 horloge et présences, 14 h programmées / 12 h suivies';
 const presence=(s,index)=>({etat:index===3?'PARTIEL':'PRESENT',revision:null,minutesPartielles:index===3?90:null,debutAttendu:s.debut,finAttendue:s.fin,motif:''});
 const firstPresence=`/api/admin/inscriptions/${a.id}/seances/${session.seances[0].id}/presence`;await api(admin,firstPresence,presence(session.seances[0],0),422,'PUT');
 let preview=await api(admin,dossierUrl+'/attestations/apercu',{});assert(preview.fields.fin&&preview.fields.presences);
 testNow=after;assert(session.seances.every(s=>new Date(s.fin)<wallAnchor));
 // Les triggers PostgreSQL, leur clock_timestamp réel et toutes leurs règles sont conservés.
 const active=(await fixture.sql("SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgname LIKE 'cmh_presence%' AND tgenabled='O'")).rows[0].n;assert.equal(active,4);
 assert.equal((await publicClient.request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...demande,email:'tardif@recette.invalid'})})).status,404);
 const closed=(await api(publicClient,'/api/formations/'+formation.slug)).formation;assert(!closed.sessions[0].preinscriptionSessionId);
 for(const [i,s]of session.seances.entries()){const url=`/api/admin/inscriptions/${a.id}/seances/${s.id}/presence`;await api(admin,url,presence(s,i),200,'PUT');await api(admin,url,{...presence(s,i),revision:1},200,'PUT');}
 const sum=await api(admin,'/api/admin/inscriptions/'+a.id+'/presences'),studentSum=await api(alice,'/api/stagiaire/inscriptions/'+a.id+'/presences');assert.equal(sum.dureeProgrammeeMs,840*60000);assert.equal(sum.dureeRenseigneeMs,720*60000);assert.equal(sum.seancesARenseigner,0);assert.equal(studentSum.dureeRenseigneeMs,sum.dureeRenseigneeMs);assert.equal(await prisma.changementPresence.count({where:{inscriptionId:a.id}}),4);pass(step);
 step='13 aperçu, émission unique et partage de l’attestation';
 preview=await api(admin,dossierUrl+'/attestations/apercu',{});assert.deepEqual(preview.fields,{});writeFileSync(path.join(fixture.run,'attestation-brouillon.pdf'),Buffer.from(preview.pdf,'base64'));
 const emission={requeteId:randomUUID(),empreinte:preview.empreinte,couranteId:preview.couranteId,motif:'',confirmation:true};const att=(await api(admin,dossierUrl+'/attestations/emettre',emission,201)).item;await api(admin,dossierUrl+'/attestations/emettre',emission);assert.equal(await prisma.attestationEmission.count({where:{inscriptionId:a.id}}),1);
 const attShare=dossierUrl+'/elements/ATTESTATION/fichiers/'+att.pieceJointe.id+'/partage';await api(admin,attShare,{partage:true,revision:0},200,'PUT');pass(step);
 step='14 téléchargement et contenu figé';
 const attRes=await alice.request(studentFile(att.pieceJointe.id));assert.equal(attRes.status,200);assert.equal(attRes.headers.get('content-type'),'application/pdf');assert.equal(attRes.headers.get('x-content-type-options'),'nosniff');assert(attRes.headers.get('content-disposition').startsWith('attachment;'));const attBytes=Buffer.from(await attRes.arrayBuffer());writeFileSync(path.join(fixture.run,'attestation-stagiaire.pdf'),attBytes);
 const stored=await prisma.attestationEmission.findUnique({where:{id:att.id},include:{pieceJointe:true}});assert.equal(hash(attBytes),stored.pieceJointe.empreinte);assert.equal(stored.donnees.dureeProgrammeeMs,sum.dureeProgrammeeMs);assert.equal(stored.donnees.dureeSuivieMs,sum.dureeRenseigneeMs);assert.equal(stored.donnees.identite.prenom,a.prenom);assert.equal(stored.donnees.sessionId,session.id);assert.equal(stored.donnees.formation.titre,formation.titre);assert.equal(stored.donnees.organisme.denomination,'CMH Recette — organisme fictif isolé');assert.equal((await bob.request(studentFile(att.pieceJointe.id))).status,404);
 await api(admin,attShare,{partage:false,revision:1},200,'PUT');assert.equal((await alice.request(studentFile(att.pieceJointe.id))).status,404);await api(admin,attShare,{partage:true,revision:2},200,'PUT');
 const endDossier=(await api(admin,dossierUrl)).item;assert.equal(endDossier.dossier.elements.find(e=>e.categorie==='PROGRAMME').note,'Note interne de recette, privée.');assert.equal(endDossier.dossier.elements.find(e=>e.categorie==='ATTESTATION').etat,'A_PREPARER');pass(step);
 step='persistance après redémarrage';const beforeRestart=await snapshot();await stopApi();await prisma.$disconnect();prisma=new PrismaClient({adapter:createPrismaAdapter(fixture.connectionString)});await startApi();assert.deepEqual(await snapshot(),beforeRestart);assert.equal((await alice.request('/api/stagiaire/inscriptions/'+a.id)).status,200);assert.equal((await admin.request(dossierUrl)).status,200);const again=await alice.request(studentFile(att.pieceJointe.id));assert.equal(again.status,200);assert.equal(hash(Buffer.from(await again.arrayBuffer())),hash(attBytes));pass(step);
 step='confidentialité, relations, historique et stockage';
 const dtos=JSON.stringify(await api(publicClient,'/api/formations/'+formation.slug));for(const secret of [demande.email,b.email,'Financeur fictif','Note interne','reponses','dureeSuivieMs','stockageKey'])assert(!dtos.includes(secret));
 assert.equal((await alice.request('/api/admin/organisme-attestation')).status,403);assert.equal((await publicClient.request(dossierUrl)).status,401);assert.equal((await bob.request('/api/stagiaire/inscriptions/'+a.id+'/presences')).status,404);
 assert.equal(await prisma.formationFormateur.count(),1);assert.equal(await prisma.inscription.count(),2);assert.equal(await prisma.dossierAdministratif.count(),2);assert.equal(await prisma.elementDocumentaire.count(),20);assert.equal(await prisma.pieceJointe.count(),3);assert.equal(await prisma.invitationStagiaire.count(),2);assert.equal(await prisma.rattachementStagiaire.count(),2);assert.equal(await prisma.partagePieceJointe.count(),6);assert.equal(await prisma.changementDocumentaire.count(),1);
 const audit=await createDocumentStorage({root:path.join(fixture.run,'documents')}).audit(prisma,{ageMs:0});assert.deepEqual(audit,{temporaires:[],orphelins:[],manquants:[],alteres:[],inconnus:0,temporairesNettoyes:0});pass(step);
 writeFileSync(path.join(fixture.run,'scenario.json'),JSON.stringify({poleId:pole.id,formateurId:formateur.id,formationId:formation.id,slug:formation.slug,sessionId:session.id,seanceIds:session.seances.map(s=>s.id),inscriptionId:a.id,autreInscriptionId:b.id,questionnaireId:q.id,documentId:versions[0].id,attestationId:att.id,attestationFichierId:att.pieceJointe.id,reference:att.reference,dureeProgrammeeMs:sum.dureeProgrammeeMs,dureeRenseigneeMs:sum.dureeRenseigneeMs},null,2));
 report();
 if(browser){
  await pause('parcours-termine',{slug:formation.slug,inscriptionId:a.id,questionnaireId:q.id});
  while(!existsSync(path.join(fixture.run,'stop-browser'))){
   const restart=path.join(fixture.run,'redemarrer');if(existsSync(restart)){unlinkSync(restart);const before=await snapshot();await stopApi();await prisma.$disconnect();prisma=new PrismaClient({adapter:createPrismaAdapter(fixture.connectionString)});await startApi();assert.deepEqual(await snapshot(),before);writeFileSync(path.join(fixture.run,'redemarrage-verifie'),new Date().toISOString());console.log('PASS redémarrage demandé pendant le navigateur, données conservées');}
   await new Promise(r=>setTimeout(r,300));
  }
 }
 const localAfter=await localSignature();assert.deepEqual(localAfter,localBefore);pass('base locale et fichiers privés inchangés (empreintes ; sessions techniques exclues)');writeFileSync(path.join(fixture.run,'local-apres.json'),JSON.stringify(localAfter,null,2));
}catch(error){console.error('FAIL recette : '+step+' ('+(error.code||error.name)+')');const frame=error.stack?.split('\n').find(l=>l.includes('recette-transversale.mjs:'));if(frame)console.error(frame);process.exitCode=1;}
finally{if(vite)await vite.close();await stopApi();if(prisma)await prisma.$disconnect();if(fixture){report();await fixture.close();console.log('RAPPORT '+path.join(fixture.run,'recette-results.json'));}}
