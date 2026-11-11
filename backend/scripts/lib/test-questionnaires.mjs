import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
export async function testQuestionnaires({prisma,client,pass,run}){
 const fixture=JSON.parse(readFileSync(path.join(run,'stagiaire-browser.json'),'utf8'));
 const admin=client(),alice=client(),bob=client(),anon=client();
 assert.equal((await admin.login()).status,200);assert.equal((await alice.login(fixture.aliceEmail,fixture.alicePassword)).status,200);assert.equal((await bob.login('bob@stagiaire-test.invalid',fixture.alicePassword)).status,200);
 const insc=fixture.aliceInscriptionId,base='/api/admin/questionnaires/modeles',assignBase='/api/admin/inscriptions/'+insc+'/questionnaires';
 const ownerBase='/api/stagiaire/inscriptions/'+insc+'/questionnaires';
 const manual=await prisma.elementDocumentaire.findMany({where:{inscriptionId:insc}});
 async function write(c,url,body,method='POST'){await c.token();return c.request(url,{method,headers:{'Content-Type':'application/json','x-csrf-token':c.csrf},body:JSON.stringify(body)});}
 const questions=['TEXTE_COURT','TEXTE_LONG','CHOIX_UNIQUE','CHOIX_MULTIPLE','NOTE'].map((type,i)=>({id:randomUUID(),type,libelle:['Votre objectif','Vos remarques','Votre niveau','Vos attentes','Votre appréciation'][i],obligatoire:i!==1,choix:type.startsWith('CHOIX')?[{id:randomUUID(),libelle:'Premier choix'},{id:randomUUID(),libelle:'Second choix'}]:[]}));
 const values={titre:'Questionnaire nominatif isolé',categorie:'POSITIONNEMENT',questions};
 assert.equal((await anon.request(base)).status,401);assert.equal((await alice.request(base)).status,403);
 assert.equal((await admin.request(base,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)})).status,403);
 let res=await write(admin,base,{titre:'Brouillon vide',categorie:'POSITIONNEMENT',questions:[]});assert.equal(res.status,201);const modeleId=(await res.json()).item.id;
 assert.equal((await write(admin,base+'/'+modeleId+'/valider',{revision:0})).status,422);
 for(const data of[{...values,extra:true},{...values,questions:[questions[0],questions[0]]},{...values,questions:[{...questions[0],type:'HTML'}]},{...values,questions:Array.from({length:41},()=>({...questions[0],id:randomUUID()}))}]){
  assert.equal((await write(admin,base+'/'+modeleId,{...data,revision:0},'PUT')).status,422);
 }
 assert.equal((await write(admin,base+'/'+modeleId,{...values,revision:0},'PUT')).status,200);
 assert.equal((await write(admin,base+'/'+modeleId+'/valider',{revision:1})).status,200);
 let modele=(await(await admin.request(base+'/'+modeleId)).json()).item;assert.equal(modele.revision,2);assert.equal(modele.valide,true);
 assert.equal((await write(admin,base+'/'+modeleId,{...values,revision:1},'PUT')).status,409);
 const reqBody={modeleId,modeleRevision:2,requeteId:randomUUID()};
 const race=await Promise.all([write(admin,assignBase,reqBody),write(admin,assignBase,reqBody)]);assert(race.every(r=>r.status===201));
 const ids=await Promise.all(race.map(async r=>(await r.json()).item.id));assert.equal(ids[0],ids[1]);const id=ids[0],student=ownerBase+'/'+id;
 assert.equal((await write(admin,assignBase,{...reqBody,requeteId:randomUUID()})).status,409);
 const original=(await(await alice.request(student)).json()).item;
 assert.equal(original.etat,'A_COMPLETER');assert.deepEqual(original.questions,questions);
 assert.equal((await write(admin,base+'/'+modeleId,{...values,titre:'Modèle modifié',questions:questions.map(q=>({...q,libelle:q.libelle+' nouveau'})),revision:2},'PUT')).status,200);
 assert.equal((await write(admin,assignBase,{...reqBody,requeteId:randomUUID(),modeleRevision:3})).status,409);
 assert.deepEqual((await(await alice.request(student)).json()).item.questions,questions);
 assert.equal((await write(admin,base+'/'+modeleId+'/valider',{revision:3})).status,200);
 pass('questionnaires : brouillon de modèle, validation, ordre/types, contraintes, conflits, attribution idempotente et questions figées après modification du modèle');
 assert.equal((await anon.request(student)).status,401);assert.equal((await bob.request(student)).status,404);assert.equal((await admin.request(student)).status,403);
 assert.equal((await bob.request(ownerBase)).status,404);
 assert.equal((await write(bob,student+'/brouillon',{revision:0,reponses:{}},'PUT')).status,404);
 assert.equal((await alice.request(student+'/brouillon',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{}'})).status,403);
 assert.equal((await write(alice,student+'/soumettre',{revision:0,reponses:{}})).status,422);
 assert.equal((await write(alice,student+'/brouillon',{revision:0,reponses:{},extra:true},'PUT')).status,422);
 const answer={[questions[0].id]:'Objectif privé',[questions[1].id]:'Texte long privé',[questions[2].id]:questions[2].choix[0].id,[questions[3].id]:[questions[3].choix[1].id],[questions[4].id]:4};
 for(const reponses of[{...answer,[questions[0].id]:'x'.repeat(501)},{...answer,[questions[1].id]:'x'.repeat(5001)},{...answer,[questions[4].id]:6},{...answer,[questions[4].id]:'4'},{...answer,[questions[2].id]:randomUUID()},{...answer,[questions[3].id]:[questions[3].choix[0].id,questions[3].choix[0].id]},{...answer,[randomUUID()]:'inconnu'}]){
  assert.equal((await write(alice,student+'/brouillon',{revision:0,reponses},'PUT')).status,422);
 }
 assert.equal((await write(alice,student+'/brouillon',{revision:0,reponses:{}},'PUT')).status,200);
 let adminRead=(await(await admin.request(assignBase)).json()).items.find(q=>q.id===id);assert.equal(adminRead.reponses,null);
 const concurrent=await Promise.all([write(alice,student+'/brouillon',{revision:1,reponses:answer},'PUT'),write(alice,student+'/brouillon',{revision:1,reponses:{...answer,[questions[0].id]:'Autre onglet'}},'PUT')]);assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
 let saved=(await(await alice.request(student)).json()).item;
 const submitBody={revision:saved.revision,reponses:answer};
 const submissions=await Promise.all([write(alice,student+'/soumettre',submitBody),write(alice,student+'/soumettre',submitBody)]);assert(submissions.every(r=>r.status===200));
 saved=(await(await alice.request(student)).json()).item;assert.equal(saved.etat,'ENVOYE');assert(saved.soumisAt);
 const sentAt=saved.soumisAt;assert.equal((await write(alice,student+'/soumettre',submitBody)).status,200);
 assert.equal((await(await alice.request(student)).json()).item.soumisAt,sentAt);
 assert.equal((await write(alice,student+'/brouillon',{revision:saved.revision,reponses:answer},'PUT')).status,409);
 assert.equal((await write(admin,assignBase+'/'+id+'/retirer',{revision:saved.revision})).status,409);
 adminRead=(await(await admin.request(assignBase)).json()).items.find(q=>q.id===id);assert.deepEqual(adminRead.reponses,answer);assert(adminRead.soumisPar.email===fixture.aliceEmail);
 for(const forbidden of ['auteurId','retireParId','soumisParId','NOTE_INTERNE','requeteId'])assert(!JSON.stringify(saved).includes(forbidden));
 assert.deepEqual(await prisma.elementDocumentaire.findMany({where:{inscriptionId:insc}}),manual);
 pass('questionnaires : droits ADMIN/propriétaire/CSRF, types et tailles stricts, champs obligatoires, brouillon concurrent, soumission unique et réponses immuables/nominatives sans effet documentaire');
 const retreatModel=await prisma.modeleQuestionnaire.create({data:{titre:'Retrait isolé',categorie:'SATISFACTION_FROID',questions,valide:true,auteurId:(await prisma.utilisateur.findFirst({where:{role:'ADMIN'}})).id,modifieParId:(await prisma.utilisateur.findFirst({where:{role:'ADMIN'}})).id}});
 const attributed=(await(await write(admin,assignBase,{modeleId:retreatModel.id,modeleRevision:0,requeteId:randomUUID()})).json()).item.id;
 const raceWithdraw=await Promise.all([write(admin,assignBase+'/'+attributed+'/retirer',{revision:0}),write(alice,ownerBase+'/'+attributed+'/soumettre',{revision:0,reponses:answer})]);
 assert.deepEqual(raceWithdraw.map(r=>r.status).sort(),[200,409]);
 const outcome=await prisma.questionnaireAttribue.findUnique({where:{id:attributed}});assert(['RETIRE','ENVOYE'].includes(outcome.etat));assert(!(outcome.soumisAt&&outcome.retireAt));
 // Retrait certain, trace conservée et réattribution volontaire après retrait.
 const withdrawnModel=await prisma.modeleQuestionnaire.create({data:{titre:'Retrait certain',categorie:'SATISFACTION_CHAUD',questions,valide:true,auteurId:retreatModel.auteurId,modifieParId:retreatModel.auteurId}});
 const withdrawn=(await(await write(admin,assignBase,{modeleId:withdrawnModel.id,modeleRevision:0,requeteId:randomUUID()})).json()).item.id;
 assert.equal((await write(admin,assignBase+'/'+withdrawn+'/retirer',{revision:0})).status,200);
 const withdrawal=await prisma.questionnaireAttribue.findUnique({where:{id:withdrawn}});
 assert.equal((await write(admin,assignBase+'/'+withdrawn+'/retirer',{revision:0})).status,200);
 assert.equal((await prisma.questionnaireAttribue.findUnique({where:{id:withdrawn}})).retireAt.getTime(),withdrawal.retireAt.getTime());
 assert.equal((await write(alice,ownerBase+'/'+withdrawn+'/soumettre',{revision:0,reponses:answer})).status,409);
 assert.equal((await write(alice,ownerBase+'/'+withdrawn+'/soumettre',{revision:0,reponses:{}})).status,409);
 assert.equal((await write(admin,assignBase,{modeleId:withdrawnModel.id,modeleRevision:0,requeteId:randomUUID()})).status,201);
 const catalogue=await(await anon.request('/api/catalogue/formations')).text();for(const secret of ['Objectif privé','reponses','QuestionnaireAttribue'])assert(!catalogue.includes(secret));
 pass('questionnaires : retrait tracé/idempotent, course retrait-soumission, réattribution après retrait et confidentialité publique');
 writeFileSync(path.join(run,'questionnaires-browser.json'),JSON.stringify({email:fixture.email,password:fixture.password,inscriptionId:fixture.inscriptionId}),{mode:0o600});
}
