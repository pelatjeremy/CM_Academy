import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {readdir,writeFile,unlink} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {createDocumentStorage} from '../../lib/documents.js';
import {supportPedagogiqueFictif} from './pedagogie-pdf-fixture.mjs';

export async function testElearning({prisma,client,pass,run,fixture,restart}){
 const creds=JSON.parse(readFileSync(path.join(run,'stagiaire-browser.json'),'utf8')),admin=client(),alice=client(),bob=client(),anon=client(),member=client();
 await admin.login();await alice.login(creds.aliceEmail,creds.alicePassword);await bob.login('bob@stagiaire-test.invalid',creds.alicePassword);await member.login('member@auth-test.invalid');
 async function write(c,url,body,method='POST'){await c.token();return c.request(url,{method,headers:{'Content-Type':'application/json','x-csrf-token':c.csrf},body:JSON.stringify(body)});}
 const creation=await write(admin,'/api/admin/formations',{titre:'Découvrir le cheval — parcours pédagogique',description:'Formation de test isolée'},'POST');assert.equal(creation.status,201);const formation=(await creation.json()).item;
 const autre=await prisma.formation.create({data:{titre:'Autre formation pédagogique'}});
 const s=await prisma.session.create({data:{formationId:formation.id}});
 async function inscription(email,statut='CONFIRMEE'){return prisma.inscription.create({data:{sessionId:s.id,email,prenom:'Alice',nom:'Pédagogie isolée',typeDemande:'PARTICULIER',statut}});}
 const a=await inscription(creds.aliceEmail),b=await inscription('bob@stagiaire-test.invalid'),wait=await inscription('attente@pedagogie.invalid','EN_ATTENTE');
 for(const i of [a,b,wait]){const inv=await write(admin,'/api/admin/inscriptions/'+i.id+'/espace-stagiaire/invitation',{});assert.equal(inv.status,201);const act=await write(anon,'/api/auth/invitations/activer',{token:(await inv.json()).fragment,password:creds.alicePassword});assert.equal(act.status,200);}
 const attente=client();await attente.login(wait.email,creds.alicePassword);
 const root='/api/admin/formations/'+formation.id+'/contenu',student='/api/stagiaire/inscriptions/'+a.id+'/parcours';
 const before={presences:await prisma.presence.count(),attestations:await prisma.attestationEmission.count(),dossiers:await prisma.dossierAdministratif.count(),documents:await prisma.changementDocumentaire.count()};
 let revision=0;const get=async()=>{const r=await admin.request(root);assert.equal(r.status,200);return r.json();};
 assert.equal((await anon.request(root)).status,401);assert.equal((await alice.request(root)).status,403);assert.equal((await member.request(root)).status,403);assert.equal((await admin.request(student)).status,403);assert.equal((await anon.request(student)).status,401);
 assert.equal((await get()).revision,0);assert.equal(await prisma.parcoursPedagogique.count(),0);assert.equal((await alice.request(student)).status,200);assert.equal(await prisma.progressionLecon.count(),0);
 const mod=(titre,extra={})=>({titre,publie:false,archive:false,revision,...extra});
 const lesson=(titre,extra={})=>({...mod(titre),contenu:'Texte pédagogique privé : observation et préparation. <img src=x onerror="alert(1)">',...extra});
 async function createModule(titre){const r=await write(admin,root+'/modules',mod(titre));assert.equal(r.status,201);const d=await r.json();revision=d.revision;return d.item.id;}
 async function createLesson(moduleId,titre,extra={}){const r=await write(admin,root+'/modules/'+moduleId+'/lecons',lesson(titre,extra));assert.equal(r.status,201);const d=await r.json();revision=d.revision;return d.item.id;}
 async function updateModule(id,extra={}){const tree=await get(),item=tree.modules.find(m=>m.id===id),r=await write(admin,root+'/modules/'+id,{titre:item.titre,publie:item.publie,archive:item.archive,revision,...extra},'PUT');assert.equal(r.status,200);revision=(await r.json()).revision;}
 async function updateLesson(id,extra={}){const item=(await get()).modules.flatMap(m=>m.lecons).find(l=>l.id===id),r=await write(admin,root+'/lecons/'+id,{titre:item.titre,contenu:item.contenu,publie:item.publie,archive:item.archive,revision,...extra},'PUT');assert.equal(r.status,200);revision=(await r.json()).revision;}
 assert.equal((await admin.request(root+'/modules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(mod('Sans CSRF'))})).status,403);
 for(const data of [mod(''),mod('x'.repeat(161)),{...mod('Champs interdits'),formationId:autre.id},mod('Archivé publié',{archive:true,publie:true})])assert.equal((await write(admin,root+'/modules',data)).status,422);
 const m1=await createModule('1 · Observer'),m2=await createModule('2 · Préparer');
 const l1=await createLesson(m1,'Observer les besoins'),l2=await createLesson(m1,'Préparer une observation',{contenu:''}),l3=await createLesson(m2,'Préparer le travail');
 assert.equal((await write(admin,root+'/lecons/'+l2,lesson('Sans contenu',{contenu:'',publie:true}),'PUT')).status,422);
 assert.equal((await write(admin,'/api/admin/formations/'+autre.id+'/contenu/modules/'+m1,mod('Autre parent'),'PUT')).status,404);
 const hidden=await(await alice.request(student)).json();assert.equal(hidden.progression.total,0);assert.equal((await alice.request(student+'/lecons/'+l1)).status,404);
 await updateLesson(l1,{publie:true});assert.equal((await alice.request(student+'/lecons/'+l1)).status,404);await updateModule(m1,{publie:true});
 let visible=await(await alice.request(student)).json();assert.equal(visible.progression.total,1);assert.equal(visible.progression.terminees,0);assert.equal(visible.modules[0].lecons[0].id,l1);
 assert(!JSON.stringify(visible).includes('Texte pédagogique privé'));assert(!JSON.stringify(visible).includes('contenu'));
 pass('pédagogie : création et lecture sans écriture, brouillons, validation, droits ADMIN/CSRF, parent étranger et publication indépendante module/leçon');
 const reorder=await write(admin,root+'/ordre',{type:'modules',moduleId:null,ids:[m2,m1],revision},'PUT');assert.equal(reorder.status,200);revision=(await reorder.json()).revision;assert.deepEqual((await get()).modules.map(m=>m.id),[m2,m1]);
 const reorderLessons=await write(admin,root+'/ordre',{type:'lecons',moduleId:m1,ids:[l2,l1],revision},'PUT');assert.equal(reorderLessons.status,200);revision=(await reorderLessons.json()).revision;
 assert.equal((await write(admin,root+'/ordre',{type:'lecons',moduleId:m1,ids:[l1],revision},'PUT')).status,422);
 assert.equal((await write(admin,root+'/ordre',{type:'modules',moduleId:null,ids:[m2,m2],revision},'PUT')).status,422);
 const races=await Promise.all([write(admin,root+'/modules/'+m1,mod('1 · Observer A',{publie:true}),'PUT'),write(admin,root+'/modules/'+m1,mod('1 · Observer B',{publie:true}),'PUT')]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);revision=(await get()).revision;
 assert.equal((await write(admin,root+'/lecons/'+l1,lesson('Ancienne révision',{revision:revision-1}),'PUT')).status,409);
 assert.equal((await admin.request(root+'/lecons/'+l1,{method:'DELETE',headers:{'x-csrf-token':admin.csrf}})).status,405);
 pass('pédagogie : ordre transactionnel unique, listes complètes, commandes concurrentes et ancienne révision refusées ; suppression physique indisponible');
 const fileRoot=root+'/lecons/'+l1+'/supports',pdf=await supportPedagogiqueFictif();writeFileSync(path.join(run,'support-pedagogique-test.pdf'),pdf);
 async function upload({bytes=pdf,name='support-observation.pdf',mime='application/pdf',depotId=randomUUID(),expected=201,rev=revision,csrf=true,c=admin}={}){
  const form=new FormData();form.append('fichier',new Blob([bytes],{type:mime}),name);await c.token();const res=await c.request(fileRoot,{method:'POST',headers:{...(csrf?{'x-csrf-token':c.csrf}:{}),'x-depot-id':depotId,'x-parcours-revision':String(rev)},body:form});assert.equal(res.status,expected);const data=await res.json();if(data.revision!==undefined)revision=data.revision;return data;
 }
 await upload({csrf:false,expected:403});await upload({c:alice,expected:403});await upload({bytes:Buffer.from('<html>faux PDF</html>'),expected:422});await upload({bytes:Buffer.from('%PDF-1.4\n'),name:'image.jpg',mime:'image/jpeg',expected:422});await upload({bytes:Buffer.alloc(10485761,65),expected:413});
 const depotId=randomUUID(),revBefore=revision;const file=(await upload({depotId,name:'../support\r\nX-Injected.pdf'})).item;await upload({depotId,name:'../support\r\nX-Injected.pdf',rev:revBefore,expected:200});assert.equal(await prisma.supportLecon.count({where:{leconId:l1}}),1);
 const download=student+'/lecons/'+l1+'/supports/'+file.id+'/telecharger';assert.equal((await anon.request(download)).status,401);assert.equal((await bob.request(download)).status,404);assert.equal((await attente.request('/api/stagiaire/inscriptions/'+wait.id+'/parcours')).status,404);
 const doc=await alice.request(download);assert.equal(doc.status,200);assert.equal(doc.headers.get('content-type'),'application/pdf');assert.equal(doc.headers.get('x-content-type-options'),'nosniff');assert(doc.headers.get('content-disposition').startsWith('attachment;'));assert(!doc.headers.get('content-disposition').includes('\r'));assert.deepEqual(Buffer.from(await doc.arrayBuffer()),pdf);
 let item=(await(await alice.request(student+'/lecons/'+l1)).json()).item;assert.equal(item.supports.length,1);assert(!JSON.stringify(item).includes('stockageKey'));assert(!JSON.stringify(item).includes('auteur'));
 const arch=await write(admin,fileRoot+'/'+file.id,{archive:true,revision},'PUT');assert.equal(arch.status,200);revision=(await arch.json()).revision;assert.equal((await alice.request(download)).status,404);const restore=await write(admin,fileRoot+'/'+file.id,{archive:false,revision},'PUT');revision=(await restore.json()).revision;
 pass('pédagogie : PDF seul extension/type/signature/taille, CSRF avant stockage, dépôt rejoué unique, en-têtes sûrs, propriétaire et retrait du support vérifiés');
 const raceRevision=revision,concurrentUploads=await Promise.all([1,2].map(async n=>{
  const form=new FormData();form.append('fichier',new Blob([pdf],{type:'application/pdf'}),'support-concurrent-'+n+'.pdf');const c=client();await c.login();await c.token();return c.request(root+'/lecons/'+l2+'/supports',{method:'POST',headers:{'x-csrf-token':c.csrf,'x-depot-id':randomUUID(),'x-parcours-revision':String(raceRevision)},body:form});
 }));assert.deepEqual(concurrentUploads.map(r=>r.status).sort(),[201,409]);revision=(await get()).revision;assert.equal(await prisma.supportLecon.count({where:{leconId:l2}}),1);
 pass('pédagogie : dépôts PDF concurrents, un seul support créé et aucun écrasement de révision');
 const progress=student+'/lecons/'+l1+'/progression';
 assert.equal((await alice.request(progress,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({terminee:true,revision:null})})).status,403);
 assert.equal((await write(bob,progress,{terminee:true,revision:null},'PUT')).status,404);
 assert.equal((await write(alice,progress,{terminee:'oui',revision:null},'PUT')).status,422);
 assert.equal((await write(alice,progress,{terminee:false,revision:null},'PUT')).status,200);assert.equal(await prisma.progressionLecon.count(),0);
 const double=await Promise.all([write(alice,progress,{terminee:true,revision:null},'PUT'),write(alice,progress,{terminee:true,revision:null},'PUT')]);assert(double.every(r=>r.status===200));assert.equal(await prisma.progressionLecon.count({where:{inscriptionId:a.id,leconId:l1}}),1);
 visible=await(await alice.request(student)).json();assert.deepEqual(visible.progression,{terminees:1,total:1});await restart();assert.equal((await alice.request(student)).status,200);await alice.login(creds.aliceEmail,creds.alicePassword);visible=await(await alice.request(student)).json();assert.deepEqual(visible.progression,{terminees:1,total:1});
 let state=(await(await alice.request(student+'/lecons/'+l1)).json()).item.progression;assert.equal((await write(alice,progress,{terminee:false,revision:state.revision-1},'PUT')).status,409);assert.equal((await write(alice,progress,{terminee:false,revision:state.revision},'PUT')).status,200);state=(await(await alice.request(student+'/lecons/'+l1)).json()).item.progression;assert.equal((await write(alice,progress,{terminee:true,revision:state.revision},'PUT')).status,200);
 await updateLesson(l2,{contenu:'Nouvelle leçon publiée, non terminée par défaut.',publie:true});visible=await(await alice.request(student)).json();assert.deepEqual(visible.progression,{terminees:1,total:2});
 await updateLesson(l1,{publie:false});visible=await(await alice.request(student)).json();assert.deepEqual(visible.progression,{terminees:0,total:1});assert.equal((await alice.request(download)).status,404);
 await updateLesson(l1,{archive:true,publie:false});assert.equal(await prisma.progressionLecon.count({where:{inscriptionId:a.id,leconId:l1}}),1);await updateLesson(l1,{archive:false,publie:true});visible=await(await alice.request(student)).json();assert.deepEqual(visible.progression,{terminees:1,total:2});
 await updateModule(m1,{archive:true,publie:false});visible=await(await alice.request(student)).json();assert.deepEqual(visible.progression,{terminees:0,total:0});assert.equal((await alice.request(student+'/lecons/'+l1)).status,404);await updateModule(m1,{archive:false,publie:true});
 await updateModule(m2,{publie:true});await updateLesson(l3,{publie:true});
 pass('pédagogie : progression déclarative unique, reprise, conflit entre onglets, reconnexion/redémarrage, nouvelle leçon, dépublication et archivage avec conservation/restauration des déclarations');
 const bobStudent='/api/stagiaire/inscriptions/'+b.id+'/parcours',bobProgress=bobStudent+'/lecons/'+l1+'/progression';
 assert.equal((await write(bob,bobProgress,{terminee:true,revision:null},'PUT')).status,200);
 assert.equal((await write(admin,'/api/admin/inscriptions/'+b.id+'/statut',{statut:'ANNULEE',statutAttendu:'CONFIRMEE'},'PUT')).status,200);
 for(const url of [bobStudent,bobStudent+'/lecons/'+l1,bobStudent+'/lecons/'+l1+'/supports/'+file.id+'/telecharger'])assert.equal((await bob.request(url)).status,404);
 assert.equal((await write(bob,bobProgress,{terminee:false,revision:1},'PUT')).status,404);assert.equal(await prisma.progressionLecon.count({where:{inscriptionId:b.id}}),1);
 const account=await prisma.utilisateur.findUnique({where:{email:creds.aliceEmail}});await prisma.utilisateur.update({where:{id:account.id},data:{actif:false}});for(const route of [student,download])assert.equal((await alice.request(route)).status,401);await prisma.utilisateur.update({where:{id:account.id},data:{actif:true}});await alice.login(creds.aliceEmail,creds.alicePassword);
 const foreignModule=await prisma.modulePedagogique.create({data:{formationId:autre.id,titre:'Autre module',ordre:0}}),foreignLesson=await prisma.leconPedagogique.create({data:{moduleId:foreignModule.id,titre:'Autre leçon',ordre:0}});
 await assert.rejects(()=>prisma.progressionLecon.create({data:{inscriptionId:a.id,leconId:foreignLesson.id,terminee:false}}));
 // Fixture publiée pour exercer aussi les relations d'une fiche publique réelle.
 await prisma.formation.update({where:{id:formation.id},data:{publiee:true,slug:'parcours-pedagogique-isole'}});
 for(const url of ['/api/catalogue/formations','/api/formations/parcours-pedagogique-isole','/api/formations']){const pub=await(await anon.request(url)).text();for(const secret of ['Texte pédagogique privé','modulesPedagogiques','SupportLecon','ProgressionLecon','stockageKey','Observer les besoins'])assert(!pub.includes(secret));}
 const secondSession=await prisma.session.create({data:{formationId:formation.id}}),secondInscription=await prisma.inscription.create({data:{sessionId:secondSession.id,email:creds.aliceEmail,prenom:'Alice',nom:'Autre inscription isolée',typeDemande:'PARTICULIER',statut:'CONFIRMEE'}});
 const secondRoot='/api/stagiaire/inscriptions/'+secondInscription.id+'/parcours';assert.equal((await alice.request(secondRoot)).status,404);
 const explicit=await write(admin,'/api/admin/inscriptions/'+secondInscription.id+'/espace-stagiaire/invitation',{});assert.equal(explicit.status,201);assert.equal((await write(anon,'/api/auth/invitations/activer',{token:(await explicit.json()).fragment,password:creds.alicePassword})).status,200);
 const independent=await(await alice.request(secondRoot)).json();assert.deepEqual(independent.progression,{terminees:0,total:3});
 assert.deepEqual({presences:await prisma.presence.count(),attestations:await prisma.attestationEmission.count(),dossiers:await prisma.dossierAdministratif.count(),documents:await prisma.changementDocumentaire.count()},before);
 await assert.rejects(()=>fixture.sql(readFileSync(path.join('prisma/rollbacks/20261111160000_contenu_pedagogique.sql'),'utf8')));await fixture.rollback();
 pass('pédagogie : annulation et compte désactivé révoquent lectures/téléchargements, isolation des inscriptions/formations, FK/progression, aucun effet documentaire/présence/attestation et API publique inchangée');
 const storage=createDocumentStorage({root:path.join(run,'documents')});const audit=await storage.audit(prisma,{ageMs:0});assert.deepEqual(audit,{temporaires:[],orphelins:[],manquants:[],alteres:[],inconnus:0,temporairesNettoyes:0});
 const objects=await readdir(path.join(run,'documents/objets'));assert.equal((await write(admin,fileRoot+'/inconnu',{archive:true,revision},'PUT')).status,404);
 const broken=path.join(run,'stockage-pedagogique-indisponible');await writeFile(broken,'panne isolée');await restart({documentStorage:{root:broken}});await admin.login();await upload({expected:503});assert.equal(await prisma.supportLecon.count({where:{leconId:l1}}),1);await restart({documentStorage:{root:path.join(run,'documents')}});await admin.login();await unlink(broken);assert.deepEqual(await readdir(path.join(run,'documents/objets')),objects);
 pass('pédagogie : audit commun reconnaît les supports, panne de stockage sans ligne ni objet incomplet ; rollback refuse les contenus/progressions présents');
 writeFileSync(path.join(run,'elearning-browser.json'),JSON.stringify({formationId:formation.id,inscriptionId:a.id,autreInscriptionId:b.id,moduleId:m1,leconId:l1,secondeLeconId:l2,supportId:file.id,email:creds.aliceEmail,password:creds.alicePassword}),{mode:0o600});
}
