import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {writeFile,readFile,rename,readdir} from 'node:fs/promises';
import {request} from 'node:http';
import path from 'node:path';
import {initialiserDossier} from '../../lib/dossiers.js';
import {completude} from '../../suivi-documents.js';
import {createDocumentStorage} from '../../lib/documents.js';
export async function testSuiviDocuments({prisma,client,pass,run,getBase}){
 const admin=client(),alice=client(),bob=client(),anon=client();await admin.login();
 const password=randomBytes(24).toString('base64url'),rules=[{categorie:'CONVENTION_CONTRAT',libelle:'Contrat signé',consigne:'Signez puis transmettez le contrat.',obligatoire:true,origine:'STAGIAIRE',demandee:true},{categorie:'PROGRAMME',libelle:'Programme de la formation',consigne:'Fourni par l’organisme.',obligatoire:false,origine:'ORGANISME',demandee:true}];
 const formation=await prisma.formation.create({data:{titre:'Suivi documentaire fictif',parcoursDocumentaire:true}}),session=await prisma.session.create({data:{formationId:formation.id}});
 async function write(c,url,body,method='POST',csrf=true){if(csrf)await c.token();return c.request(url,{method,headers:{'Content-Type':'application/json',...(csrf?{'x-csrf-token':c.csrf}:{})},body:JSON.stringify(body)});}
 const config='/api/admin/formations/'+formation.id+'/documents';
 assert.equal((await write(admin,config,{revision:0,regles:rules},'PUT',false)).status,403);
 assert.equal((await write(admin,config,{revision:0,regles:rules},'PUT')).status,200);
 assert.equal((await write(admin,config,{revision:0,regles:rules},'PUT')).status,409);
 async function create(email,c){const i=await prisma.inscription.create({data:{sessionId:session.id,email,prenom:'Essai',nom:email.startsWith('alice')?'Alice fictive':'Bob fictif',typeDemande:'PARTICULIER',statut:'CONFIRMEE'}});await prisma.$transaction(tx=>initialiserDossier(tx,i.id));const invite=await write(admin,'/api/admin/inscriptions/'+i.id+'/espace-stagiaire/invitation',{});assert.equal(invite.status,201);const {fragment}=await invite.json();assert.equal((await write(anon,'/api/auth/invitations/activer',{token:fragment,password})).status,200);assert.equal((await c.login(email,password)).status,200);return i;}
 const a=await create('alice@documents-test.invalid',alice),b=await create('bob@documents-test.invalid',bob);
 const root='/api/stagiaire/inscriptions/'+a.id,docs=root+'/documents',adminDocs='/api/admin/inscriptions/'+a.id+'/documents';
 const where={inscriptionId_categorie:{inscriptionId:a.id,categorie:'CONVENTION_CONTRAT'}};
 await prisma.elementDocumentaire.update({where,data:{note:'NOTE_INTERNE_NE_PAS_EXPOSER'}});
 async function element(){return prisma.elementDocumentaire.findUnique({where});}
 async function detail(c=alice,url=docs){const r=await c.request(url);assert.equal(r.status,200);return r.json();}
 let data=await detail();assert.equal(data.items.length,1);assert.equal(data.items[0].libelle,'Contrat signé');assert.equal((await detail(admin,adminDocs)).completude.manquantes,1);
 assert.equal(completude([{demandee:true,obligatoire:false,suiviEtat:'A_TRANSMETTRE'}]).complet,true);
 assert.equal((await bob.request(docs)).status,404);assert.equal((await anon.request(docs)).status,401);assert.equal((await admin.request(docs)).status,403);
 const pdf=Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
 const url=root+'/dossier/elements/CONVENTION_CONTRAT/fichiers';
 async function upload({c=alice,route=url,revision=0,suivi=0,id=randomUUID(),bytes=pdf,type='application/pdf',name='contrat-fictif.pdf',csrf=true}={}){if(csrf)await c.token();const form=new FormData();form.append('fichier',new Blob([bytes],{type}),name);return c.request(route,{method:'POST',body:form,headers:{'x-depot-id':id,'x-fichier-revision':String(revision),'x-suivi-revision':String(suivi),...(csrf?{'x-csrf-token':c.csrf}:{})}});}
 assert.equal((await upload({c:bob})).status,404);assert.equal((await upload({csrf:false})).status,403);
 assert.equal((await upload({route:url.replace('CONVENTION_CONTRAT','PROGRAMME')})).status,404);
 assert.equal((await upload({bytes:Buffer.from('Faux PDF')})).status,422);assert.equal((await upload({bytes:Buffer.alloc(10485761)})).status,413);
 const transaction=prisma.$transaction.bind(prisma);
 prisma.$transaction=async(...args)=>{if(typeof args[0]==='function')throw new Error('ISOLATED_ROLLBACK');return transaction(...args);};
 try{assert.equal((await upload()).status,503);}finally{prisma.$transaction=transaction;}
 const token=randomUUID();let uncertain=true;
 prisma.$transaction=async(...args)=>{const result=await transaction(...args);if(uncertain&&typeof args[0]==='function'){uncertain=false;throw new Error('ISOLATED_LOST_RESPONSE');}return result;};
 try{assert.equal((await upload({id:token})).status,503);}finally{prisma.$transaction=transaction;}
 assert.equal((await upload({id:token})).status,200);
 let e=await element();assert.equal(e.suiviEtat,'A_VERIFIER');assert.equal(e.fichierRevision,1);assert.equal(e.etat,'A_PREPARER');
 const first=await prisma.pieceJointe.findFirst({where:{inscriptionId:a.id,version:1}});assert.equal(first.stockageClassement,a.id+'/CONVENTION_CONTRAT');assert.equal(first.partageStagiaire,false);
 assert.deepEqual(await readFile(path.join(run,'documents/objets',first.stockageClassement,first.stockageKey+'.blob')),pdf);
 const dl=url+'/'+first.id+'/telecharger';assert.equal((await alice.request(dl)).status,200);assert.equal((await bob.request(dl)).status,404);assert.equal((await anon.request(dl)).status,401);
 pass('suivi : configuration versionnée, règles copiées par inscription, facultatif non bloquant, rôles/propriété/CSRF, formats et taille, dépôt idempotent classé en privé sans validation administrative');
 async function decide({version,revision,etat='A_CORRIGER',motif='La signature manque.',requeteId=randomUUID(),who=admin}={}){return write(who,adminDocs+'/CONVENTION_CONTRAT/decision',{version,revision,etat,motif,requeteId});}
 const decisionId=randomUUID();assert.equal((await decide({version:1,revision:1,requeteId:decisionId})).status,200);assert.equal((await decide({version:1,revision:1,requeteId:decisionId})).status,200);
 assert.equal((await decide({version:1,revision:1,requeteId:decisionId,motif:'Rejeu altéré'})).status,409);
 data=await detail();assert.equal(data.items[0].suiviEtat,'A_CORRIGER');assert(data.items[0].suiviHistorique.some(h=>h.motif==='La signature manque.'));
 assert.equal((await decide({version:1,revision:2,who:alice})).status,403);
 assert.equal((await upload({revision:1,suivi:1})).status,409);
 const race=await Promise.all([upload({revision:1,suivi:2}),upload({revision:1,suivi:2})]);assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
 assert.equal((await decide({version:1,revision:3,etat:'VALIDE',motif:''})).status,409);
 const decisions=await Promise.all([decide({version:2,revision:3,etat:'VALIDE',motif:''}),decide({version:2,revision:3})]);assert.deepEqual(decisions.map(r=>r.status).sort(),[200,409]);
 e=await element();assert.equal(e.fichierRevision,2);assert.equal(e.suiviHistorique.filter(h=>h.type==='DECISION').length,2);assert(e.suiviHistorique.every(h=>h.auteurId&&h.date));
 if(e.suiviEtat==='A_CORRIGER'){assert.equal((await upload({revision:2,suivi:4})).status,201);assert.equal((await decide({version:3,revision:5,etat:'VALIDE',motif:''})).status,200);}
 assert.equal((await detail(admin,adminDocs)).completude.complet,true);
 const before=await element();assert.equal((await upload({revision:before.fichierRevision,suivi:before.suiviRevision})).status,201);e=await element();assert.equal(e.suiviEtat,'A_VERIFIER');assert.equal((await detail(admin,adminDocs)).completude.complet,false);
 assert.equal((await alice.request(dl)).status,200);assert.equal(await prisma.presence.count({where:{inscriptionId:a.id}}),0);assert.equal(await prisma.attestationEmission.count({where:{inscriptionId:a.id}}),0);assert.equal((await prisma.inscription.findUnique({where:{id:a.id}})).statut,'CONFIRMEE');
 pass('suivi : correction visible, nouvelle version à vérifier, décisions auteur/date/version, doubles clics/rejeux et décisions/dépôts concurrents ; historique conservé et aucun autre état validé');
 assert.equal((await prisma.formation.findUnique({where:{id:formation.id}})).documentsHistorique.length,1);
 const after=await element();assert.equal((await write(admin,config,{revision:1,regles:[]},'PUT')).status,200);assert.deepEqual(await element(),after);
 const optional={...rules[0],obligatoire:false};assert.equal((await write(admin,adminDocs+'/CONVENTION_CONTRAT/configuration',{revision:after.suiviRevision,regle:optional},'PUT')).status,200);assert.equal((await detail(admin,adminDocs)).completude.complet,true);
 data=await detail();for(const secret of ['NOTE_INTERNE_NE_PAS_EXPOSER','stockageKey','empreinte','auteurId','CONFIGURATION'])assert(!JSON.stringify(data).includes(secret));
 const filtered=await(await admin.request('/api/admin/suivi-documents?formationId='+formation.id+'&sessionId='+session.id+'&q=Alice')).json();assert.equal(filtered.items.length,1);assert.equal(filtered.items[0].id,a.id);
 assert.equal((await bob.request('/api/admin/suivi-documents')).status,403);
 // Panne réelle confinée au fichier isolé, puis reprise.
 const object=path.join(run,'documents/objets',first.stockageClassement,first.stockageKey+'.blob');await rename(object,object+'.offline');try{assert.equal((await alice.request(dl)).status,503);}finally{await rename(object+'.offline',object);}
 await prisma.inscription.update({where:{id:a.id},data:{statut:'ANNULEE'}});assert.equal((await upload({revision:99,suivi:99})).status,403);assert.equal((await alice.request(dl)).status,200);await prisma.inscription.update({where:{id:a.id},data:{statut:'CONFIRMEE'}});
 const user=await prisma.utilisateur.findUnique({where:{email:a.email}});await prisma.utilisateur.update({where:{id:user.id},data:{actif:false}});assert.equal((await alice.request(dl)).status,401);await prisma.utilisateur.update({where:{id:user.id},data:{actif:true}});await alice.login(a.email,password);
 // Transfert interrompu côté stagiaire : aucune version et temporaire nettoyé.
 await alice.token();e=await element();const boundary='suivi-'+randomUUID(),beforeCount=await prisma.pieceJointe.count();
 const partial=request(new URL(url,getBase()),{method:'POST',headers:{Origin:'http://127.0.0.1:5173',Cookie:alice.cookie,'x-csrf-token':alice.csrf,'x-depot-id':randomUUID(),'x-fichier-revision':String(e.fichierRevision),'x-suivi-revision':String(e.suiviRevision),'Content-Type':'multipart/form-data; boundary='+boundary,'Content-Length':'200000'}});partial.on('error',()=>{});partial.write('--'+boundary+'\r\nContent-Disposition: form-data; name="fichier"; filename="interrompu.pdf"\r\nContent-Type: application/pdf\r\n\r\n');partial.write(Buffer.alloc(20000,65));
 async function until(check){for(let n=0;n<100;n++){if(await check())return;await new Promise(r=>setTimeout(r,25));}assert.fail('Nettoyage non atteint');}
 await until(async()=>(await readdir(path.join(run,'documents/temporaires'))).length>0);partial.destroy();await until(async()=>(await readdir(path.join(run,'documents/temporaires'))).length===0);assert.equal(await prisma.pieceJointe.count(),beforeCount);
 const audit=await createDocumentStorage({root:path.join(run,'documents')}).audit(prisma,{ageMs:0});assert.deepEqual(audit.orphelins,[]);assert.deepEqual(audit.manquants,[]);assert.deepEqual(audit.alteres,[]);
 const legacy=await prisma.inscription.create({data:{sessionId:session.id,email:'legacy@documents-test.invalid',prenom:'Ancien',nom:'Dossier fictif',typeDemande:'PARTICULIER',dossier:{create:{parcoursDocumentaire:false}}}});
 const init='/api/admin/inscriptions/'+legacy.id+'/documents/initialiser';
 assert.equal((await write(admin,init,{},'POST',false)).status,403);
 assert((await Promise.all([write(admin,init,{}),write(admin,init,{})])).every(r=>r.status===200));
 assert.equal(await prisma.elementDocumentaire.count({where:{inscriptionId:legacy.id}}),10);
 const legacyUpload='/api/admin/inscriptions/'+legacy.id+'/dossier/elements/CONVENTION_CONTRAT/fichiers';
 assert.equal((await upload({c:admin,route:legacyUpload})).status,201);
 const legacyWhere={inscriptionId_categorie:{inscriptionId:legacy.id,categorie:'CONVENTION_CONTRAT'}};
 assert.equal((await prisma.elementDocumentaire.findUnique({where:legacyWhere})).suiviEtat,'A_TRANSMETTRE');
 const legacyConfig='/api/admin/inscriptions/'+legacy.id+'/documents/CONVENTION_CONTRAT/configuration';
 assert.equal((await write(admin,legacyConfig,{revision:0,regle:rules[0]},'PUT')).status,200);
 const activated=await prisma.elementDocumentaire.findUnique({where:legacyWhere});assert.equal(activated.fichierRevision,1);assert.equal(activated.suiviEtat,'A_VERIFIER');
 assert.equal((await write(admin,legacyConfig,{revision:1,regle:{...rules[0],demandee:false}},'PUT')).status,200);
 assert.equal(await prisma.pieceJointe.count({where:{inscriptionId:legacy.id}}),1);
 assert.deepEqual((await createDocumentStorage({root:path.join(run,'documents')}).audit(prisma,{ageMs:0})).orphelins,[]);
 pass('suivi : évolution de règles sans perte, adaptation individuelle, filtres, confidentialité, panne/reprise, annulation, compte désactivé, transfert interrompu et audit sans orphelins');
 await writeFile(path.join(run,'documents-browser.json'),JSON.stringify({inscriptionId:a.id,formationId:formation.id,email:a.email,password}),{mode:0o600});await writeFile(path.join(run,'contrat-fictif.pdf'),pdf);
}
