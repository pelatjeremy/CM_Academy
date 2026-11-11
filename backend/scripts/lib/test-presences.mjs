import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {parisInput} from '../../admin/paris-time.js';
export async function testPresences({prisma,client,pass,run}){
 const creds=JSON.parse(readFileSync(path.join(run,'stagiaire-browser.json'),'utf8')),admin=client(),alice=client(),bob=client(),anon=client();
 assert.equal((await admin.login()).status,200);assert.equal((await alice.login(creds.aliceEmail,creds.alicePassword)).status,200);assert.equal((await bob.login('bob@stagiaire-test.invalid',creds.alicePassword)).status,200);
 async function write(c,url,body,method='PUT'){await c.token();return c.request(url,{method,headers:{'Content-Type':'application/json','x-csrf-token':c.csrf},body:JSON.stringify(body)});}
 const formation=await prisma.formation.create({data:{titre:'Présences isolées',description:'Présentation test',dureeMinutes:840,parcoursDocumentaire:true}});
 const times=Array.from({length:4},(_,i)=>({debut:new Date('2025-01-'+String(10+i).padStart(2,'0')+'T08:00:00Z'),fin:new Date('2025-01-'+String(10+i).padStart(2,'0')+'T11:30:00Z')}));
 const session=await prisma.session.create({data:{formationId:formation.id,seances:{create:[...times,{debut:new Date('2099-01-10T08:00Z'),fin:new Date('2099-01-10T09:00Z')}]}}});
 const seances=await prisma.seance.findMany({where:{sessionId:session.id},orderBy:{debut:'asc'}});
 async function insc(email,sessionId=session.id,statut='CONFIRMEE'){return prisma.inscription.create({data:{sessionId,email,prenom:email.startsWith('bob')?'Bob':'Alice',nom:'Présences isolées',typeDemande:'PARTICULIER',statut,dossier:{create:{parcoursDocumentaire:true,elements:{create:{categorie:'EMARGEMENT',note:'Note interne intacte'}}}}}});}
 const a=await insc(creds.aliceEmail),b=await insc('bob@stagiaire-test.invalid'),attente=await insc('attente@presence.invalid',session.id,'EN_ATTENTE');
 async function rattacher(i){const inv=await write(admin,'/api/admin/inscriptions/'+i.id+'/espace-stagiaire/invitation',{},'POST');assert.equal(inv.status,201);const token=(await inv.json()).fragment;assert.equal((await write(anon,'/api/auth/invitations/activer',{token,password:creds.alicePassword},'POST')).status,200);}
 await rattacher(a);await rattacher(b);
 const manual=await prisma.elementDocumentaire.findMany({where:{inscriptionId:a.id}});
 const root=s=>'/api/admin/sessions/'+s+'/presences',route=(i,s)=>'/api/admin/inscriptions/'+i+'/seances/'+s.id+'/presence';
 const body=(s,etat='PRESENT',revision=null,extra={})=>({etat,revision,minutesPartielles:null,debutAttendu:s.debut.toISOString(),finAttendue:s.fin.toISOString(),motif:'',...extra});
 const before=await prisma.presence.count();
 assert.equal((await anon.request(root(session.id))).status,401);assert.equal((await alice.request(root(session.id))).status,403);assert.equal((await admin.request('/api/stagiaire/inscriptions/'+a.id+'/presences')).status,403);
 assert.equal((await admin.request(root(session.id))).status,200);let sum=await(await admin.request('/api/admin/inscriptions/'+a.id+'/presences')).json();
 assert.equal(sum.dureeProgrammeeMs,900*60000);assert.equal(sum.dureePedagogiqueMinutes,840);assert.equal(sum.dureeRenseigneeMs,null);assert.equal(sum.seancesARenseigner,5);
 assert.equal(await prisma.presence.count(),before);
 assert.equal((await admin.request(route(a.id,seances[0]),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body(seances[0]))})).status,403);
 assert.equal((await write(alice,route(a.id,seances[0]),body(seances[0]))).status,403);
 for(const extra of[{etat:'INVALIDE'},{etat:'PARTIEL',minutesPartielles:-1},{etat:'PARTIEL',minutesPartielles:211},{etat:'PARTIEL',minutesPartielles:210},{etat:'PARTIEL',minutesPartielles:0},{etat:'PARTIEL',minutesPartielles:1.5},{etat:'PRESENT',minutesPartielles:10},{extra:true}]){
  assert.equal((await write(admin,route(a.id,seances[0]),body(seances[0],'PRESENT',null,extra))).status,422);
 }
 assert.equal((await write(admin,route(a.id,seances[4]),body(seances[4]))).status,422);
 assert.equal((await write(admin,route(attente.id,seances[0]),body(seances[0]))).status,422);
 const foreign=await prisma.session.create({data:{formationId:formation.id,seances:{create:{debut:new Date('2025-02-01T08:00Z'),fin:new Date('2025-02-01T09:00Z')}}}});
 const foreignSeance=await prisma.seance.findFirst({where:{sessionId:foreign.id}});
 assert.equal((await write(admin,route(a.id,foreignSeance),body(foreignSeance))).status,422);
 assert.equal((await write(admin,route(a.id,seances[0]),body(seances[0],'NON_RENSEIGNE'))).status,200);assert.equal(await prisma.presence.count(),before);
 for(const [index,etat,minutes]of[[0,'PRESENT',null],[1,'PARTIEL',90],[2,'ABSENT',null]]){
  assert.equal((await write(admin,route(a.id,seances[index]),body(seances[index],etat,null,{minutesPartielles:minutes}))).status,200);
 }
 sum=await(await alice.request('/api/stagiaire/inscriptions/'+a.id+'/presences')).json();
 assert.equal(sum.dureeRenseigneeMs,300*60000);assert.equal(sum.seancesARenseigner,2);
 assert.equal(sum.seances[2].presence.dureeSuivieMs,0);assert.equal(sum.seances[3].presence,null);
 assert.equal((await bob.request('/api/stagiaire/inscriptions/'+a.id+'/presences')).status,404);
 for(const secret of['historique','motif','modifiePar','auteur','revision','updatedAt','Note interne'])assert(!JSON.stringify(sum).includes(secret));
 pass('présences : lecture sans écriture, ADMIN/propriétaire/CSRF, états, minutes strictes, future/autre session/non-confirmée refusées et totaux distinguant inconnu/zéro/pédagogie');
 assert.equal((await write(admin,route(a.id,seances[0]),body(seances[0],'PARTIEL',1,{minutesPartielles:120}))).status,422);
 const correction=await write(admin,route(a.id,seances[0]),body(seances[0],'PARTIEL',1,{minutesPartielles:120,motif:'Correction interne justifiée'}));assert.equal(correction.status,200);
 let row=(await correction.json()).item;assert.equal(row.revision,2);assert.equal(row.historique.length,2);
 const history=row.historique.find(e=>e.ancienEtat==='PRESENT');assert.equal(history.nouvelEtat,'PARTIEL');assert.equal(history.ancienneDureeMs,210*60000);assert.equal(history.nouvelleDureeMs,120*60000);assert(history.auteur.email);
 assert.equal((await write(admin,route(a.id,seances[0]),body(seances[0],'PARTIEL',2,{minutesPartielles:120}))).status,200);
 assert.equal(await prisma.changementPresence.count({where:{inscriptionId:a.id,seanceId:seances[0].id}}),2);
 const races=await Promise.all([write(admin,route(b.id,seances[0]),body(seances[0])),write(admin,route(b.id,seances[0]),body(seances[0],'ABSENT'))]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);
 assert.equal(await prisma.presence.count({where:{inscriptionId:b.id,seanceId:seances[0].id}}),1);
 function sessionPayload(item){return {formationId:item.formationId,capacite:item.capacite,lieu:item.lieu,modalitesPratiques:item.modalitesPratiques,fuseauHoraire:'Europe/Paris',updatedAt:item.updatedAt,seances:item.seances.map(s=>({id:s.id,debutLocal:s.debutLocal,finLocal:s.finLocal,debutOffset:s.debutOffset,finOffset:s.finOffset}))};}
 let sessionDetail=(await(await admin.request('/api/admin/sessions/'+session.id)).json()).item;
 let payload=sessionPayload(sessionDetail);payload.seances[0].finLocal='2025-01-10T13:00';
 assert.equal((await write(admin,'/api/admin/sessions/'+session.id,payload)).status,422);
 payload=sessionPayload(sessionDetail);payload.seances=payload.seances.filter(s=>s.id!==seances[0].id);assert.equal((await write(admin,'/api/admin/sessions/'+session.id,payload)).status,422);
 payload=sessionPayload(sessionDetail);payload.lieu='Lieu corrigé sans changer les horaires';assert.equal((await write(admin,'/api/admin/sessions/'+session.id,payload)).status,200);
 assert.equal((await write(admin,route(a.id,seances[0]),body(seances[0],'NON_RENSEIGNE',2,{motif:'Durée à vérifier'}))).status,200);
 row=await prisma.presence.findUnique({where:{inscriptionId_seanceId:{inscriptionId:a.id,seanceId:seances[0].id}}});assert.equal(row.dureeSuivieMs,null);
 sessionDetail=(await(await admin.request('/api/admin/sessions/'+session.id)).json()).item;payload=sessionPayload(sessionDetail);payload.seances[0].debutLocal='2025-01-10T09:01';assert.equal((await write(admin,'/api/admin/sessions/'+session.id,payload)).status,422);
 assert.equal((await write(admin,'/api/admin/inscriptions/'+a.id+'/statut',{statut:'ANNULEE',statutAttendu:'CONFIRMEE'})).status,200);
 assert.equal((await write(admin,route(a.id,seances[0]),body(seances[0],'PRESENT',3,{motif:'Tentative après annulation'}))).status,422);
 sum=await(await alice.request('/api/stagiaire/inscriptions/'+a.id+'/presences')).json();assert.equal(sum.statut,'ANNULEE');assert.equal(sum.dureeRenseigneeMs,90*60000);assert.equal(sum.seancesARenseigner,3);
 assert((await(await admin.request(root(session.id))).json()).item.inscriptions.some(i=>i.id===a.id&&i.statut==='ANNULEE'));
 assert.deepEqual(await prisma.elementDocumentaire.findMany({where:{inscriptionId:a.id}}),manual);
 pass('présences : correction avec motif/auteur/date/anciennes valeurs, no-op sans audit doublonné, unicité concurrente, gel des horaires/retrait de séance, annulation et indépendance documentaire');
 const raceInscription=await insc('race@presence.invalid',foreign.id);
 const raceDetail=(await(await admin.request('/api/admin/sessions/'+foreign.id)).json()).item;
 const moved=sessionPayload(raceDetail),start=parisInput(new Date(foreignSeance.debut.getTime()+60000));moved.seances[0].debutLocal=start.local;moved.seances[0].debutOffset=start.offset;
 const racesSchedule=await Promise.all([write(admin,route(raceInscription.id,foreignSeance),body(foreignSeance)),write(admin,'/api/admin/sessions/'+foreign.id,moved)]);
 assert.equal(racesSchedule.filter(r=>r.status===200).length,1);assert(racesSchedule.every(r=>[200,409,422].includes(r.status)));
 const stored=await prisma.presence.findUnique({where:{inscriptionId_seanceId:{inscriptionId:raceInscription.id,seanceId:foreignSeance.id}}});if(stored){const actual=await prisma.seance.findUnique({where:{id:foreignSeance.id}});assert.equal(stored.debut.getTime(),actual.debut.getTime());assert.equal(stored.fin.getTime(),actual.fin.getTime());}
 const pub=await(await anon.request('/api/catalogue/formations')).text();for(const field of ['dureeSuivieMs','Correction interne','ChangementPresence'])assert(!pub.includes(field));
 pass('présences : course première saisie/modification des horaires sans réinterprétation et confidentialité publique');
 const browserSession=await prisma.session.create({data:{formationId:formation.id,seances:{create:[{debut:new Date('2025-03-10T08:00Z'),fin:new Date('2025-03-10T11:30Z')},{debut:new Date('2099-03-10T08:00Z'),fin:new Date('2099-03-10T09:00Z')}]}}});
 const browserInscription=await insc('bob@stagiaire-test.invalid',browserSession.id);await rattacher(browserInscription);
 writeFileSync(path.join(run,'presences-browser.json'),JSON.stringify({sessionId:browserSession.id,inscriptionId:browserInscription.id,email:'bob@stagiaire-test.invalid',password:creds.alicePassword}),{mode:0o600});
}
