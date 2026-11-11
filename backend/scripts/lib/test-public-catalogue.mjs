import assert from 'node:assert/strict';
import {price,parisTime,parisDate} from '../../../frontend/src/public/format.js';

export async function testPublicCatalogue({prisma,client,pass}){
  const anon=client(),admin=client();assert.equal((await admin.login()).status,200);
  const root='/api/formations',catalogue='/api/catalogue/formations';
  const pole=await prisma.pole.create({data:{titre:'Bien-être du cheval',slug:'pole-public-test',description:'Connaître et accompagner les besoins du cheval.'}});
  const trainer=await prisma.formateur.create({data:{nom:'Camille — essai isolé',biographie:'Présentation publique de la formatrice.'}});
  const complete={titre:'Comprendre le bien-être du cheval',slug:'bien-etre-public-test',description:'Une présentation pédagogique.\nUne seconde ligne.',resume:'Observer le cheval et approfondir ses connaissances.',
    objectifs:'Identifier les besoins du cheval.',programme:'Observer\nComprendre\nMettre en pratique',publicVise:'Professionnels et passionnés du cheval',prerequis:'Aucun prérequis',format:'WEBINAIRE',dureeMinutes:840,
    tarif:'1234.56',devise:'EUR',financement:'Un financement peut être étudié selon votre situation.',poleId:pole.id,publiee:true,parcoursDocumentaire:true};
  const published=await prisma.formation.create({data:{...complete,formateurs:{create:{formateurId:trainer.id}}}});
  const draft=await prisma.formation.create({data:{...complete,titre:'SECRET_DRAFT_TITLE',slug:'brouillon-public-test',publiee:false,formateurs:{create:{formateurId:trainer.id}}}});
  const empty=await prisma.formation.create({data:{...complete,titre:'Tarif à préciser — essai isolé',slug:'tarif-absent-public-test',tarif:null,financement:''}});
  await prisma.formation.create({data:{...complete,titre:'Formation gratuite — essai isolé',slug:'gratuit-public-test',tarif:'0.00'}});
  const seance=(debut,fin)=>({debut:new Date(debut),fin:new Date(fin)});
  const hidden=await prisma.session.create({data:{formationId:published.id,lieu:'SECRET_HIDDEN_LOCATION',modalitesPratiques:'SECRET_ADMIN_MODALITES',seances:{create:seance('2027-01-02T09:00:00Z','2027-01-02T12:30:00Z')}}});assert.equal(hidden.visiblePubliquement,false);
  const visible=await prisma.session.create({data:{formationId:published.id,visiblePubliquement:true,lieu:'En ligne',modalitesPratiques:'SECRET_ADMIN_MODALITES',capacite:21,seances:{create:[seance('2027-06-02T07:00:00Z','2027-06-02T10:30:00Z'),seance('2027-06-09T07:00:00Z','2027-06-09T10:30:00Z'),seance('2027-06-16T07:00:00Z','2027-06-16T10:30:00Z'),seance('2027-06-23T07:00:00Z','2027-06-23T10:30:00Z')]}}});
  await prisma.session.create({data:{formationId:published.id,visiblePubliquement:true,lieu:'SECRET_EMPTY_SESSION'}}); // Héritage SQL invalide : exclu de la lecture publique.
  await prisma.session.create({data:{formationId:draft.id,visiblePubliquement:true,lieu:'SECRET_DRAFT_SESSION',seances:{create:seance('2027-05-02T09:00:00Z','2027-05-02T10:00:00Z')}}});
  const autumn=await prisma.session.create({data:{formationId:published.id,visiblePubliquement:true,lieu:'Lieu public du rendez-vous',seances:{create:seance('2026-10-25T00:30:00Z','2026-10-25T01:30:00Z')}}});
  for(const sessionId of[visible.id,autumn.id,hidden.id])await prisma.sessionAccesPrive.create({data:{sessionId,lienVisioconference:'https://visio.invalid/SECRET_PRIVATE_URL',consignes:'SECRET_PRIVATE_CONSIGNES'}});
  const request=async(route,status=200)=>{const r=await anon.request(route);assert.equal(r.status,status,route);return{response:r,data:await r.json()};};
  const unknown=await request(`${root}/inconnu-public-test`,404),unpublished=await request(`${root}/${draft.slug}`,404);assert.deepEqual(unknown.data,unpublished.data);
  await request(`${root}/Slug-Invalide`,404);
  const detail=await request(`${root}/${published.slug}`),f=detail.data.formation;assert.equal(detail.response.headers.get('cache-control'),'no-store');assert.equal(f.slug,published.slug);assert.equal(f.tarif,'1234.56');
  assert.deepEqual(Object.keys(f).sort(),['titre','slug','resume','description','objectifs','programme','publicVise','prerequis','format','dureeMinutes','tarif','devise','financement','pole','formateurs','sessions'].sort());
  assert.deepEqual(Object.keys(f.pole).sort(),['titre','slug','description'].sort());assert.deepEqual(Object.keys(f.formateurs[0]).sort(),['biographie','nom']);
  assert.equal(f.sessions.length,2);assert.equal(f.sessions[0].seances[0].debut,'2026-10-25T00:30:00.000Z');assert.equal(f.sessions[1].seances.length,4);
  for(const s of f.sessions){assert.deepEqual(Object.keys(s).sort(),['lieu','seances']);for(const date of s.seances)assert.deepEqual(Object.keys(date).sort(),['debut','fin']);}
  const cards=(await request(catalogue)).data.formations;assert(cards.some(c=>c.slug===published.slug));assert(!cards.some(c=>c.slug===draft.slug));
  for(const card of cards)assert.deepEqual(Object.keys(card).sort(),['id','titre','slug','resume','description','format','dureeMinutes','tarif','devise','pole'].sort());
  const legacy=(await request(root)).data.formations;for(const card of legacy)assert.deepEqual(Object.keys(card).sort(),['description','id','titre']);
  for(const body of[detail.data,cards,legacy]){const serialized=JSON.stringify(body);for(const secret of['SECRET_','updatedAt','createdAt','formationId','formateurId','sessionId','capacite','visiblePubliquement','parcoursDocumentaire','motDePasseHash','accesPrive','lienVisioconference','consignes'])assert(!serialized.includes(secret),secret);}
  pass('public : fiche publiée, brouillon/inconnu 404 identiques ; sélections strictes, relations sans brouillon ni données privées ; contrat historique intact');
  assert.equal((await request(`${root}/${empty.slug}`)).data.formation.tarif,null);assert.equal((await request(`${root}/gratuit-public-test`)).data.formation.tarif,'0.00');
  assert.equal((await request(`${root}/${empty.slug}`)).data.formation.sessions.length,0);
  assert.equal(price(null,'EUR'),'Tarif non renseigné');assert.equal(price('0.00','EUR'),'Gratuit');assert.equal(price('1234.56','EUR'),'1\u202f234,56 EUR');assert.equal(price('9999999999.99','USD'),'9\u202f999\u202f999\u202f999,99 USD');
  assert.match(parisTime('2026-10-25T00:30:00Z'),/02:30 UTC\+2/);assert.match(parisTime('2026-10-25T01:30:00Z'),/02:30 UTC\+1/);assert.match(parisTime('2027-06-02T07:00:00Z'),/09:00 UTC\+2/);assert.match(parisDate('2027-06-02T07:00:00Z'),/2 juin 2027/);
  pass('public : tarifs exacts absent/gratuit/payant, formatage sans flottants ; heures de Paris été/hiver et absence de session visible');
  async function write(route,body,csrf=true){if(csrf)await admin.token();return admin.request(route,{method:'PUT',headers:{'Content-Type':'application/json',...(csrf?{'x-csrf-token':admin.csrf}:{})},body:JSON.stringify(body)});}
  const readSession=async id=>(await(await admin.request(`/api/admin/sessions/${id}`)).json()).item;
  let session=await readSession(hidden.id);
  const bodyOf=s=>({formationId:s.formationId,visiblePubliquement:true,updatedAt:s.updatedAt,seances:s.seances.map(row=>({id:row.id,debutLocal:row.debutLocal,finLocal:row.finLocal,debutOffset:row.debutOffset,finOffset:row.finOffset}))});
  assert.equal((await write(`/api/admin/sessions/${hidden.id}`,bodyOf(session),false)).status,403);
  const stale=session.updatedAt;let r=await write(`/api/admin/sessions/${hidden.id}`,bodyOf(session));assert.equal(r.status,200);session=(await r.json()).item;
  assert.equal((await request(`${root}/${published.slug}`)).data.formation.sessions.length,3);
  assert.equal((await write(`/api/admin/sessions/${hidden.id}`,{...bodyOf(session),visiblePubliquement:false,updatedAt:stale})).status,409);
  assert.equal((await write(`/api/admin/sessions/${hidden.id}`,{...bodyOf(session),visiblePubliquement:false})).status,200);
  assert.equal((await request(`${root}/${published.slug}`)).data.formation.sessions.length,2);
  const noDates=await prisma.session.create({data:{formationId:published.id}});session=await readSession(noDates.id);const bad=await write(`/api/admin/sessions/${noDates.id}`,bodyOf(session));assert.equal(bad.status,422);assert((await bad.json()).fields.visiblePubliquement);
  await prisma.formation.update({where:{id:published.id},data:{publiee:false}});await request(`${root}/${published.slug}`,404);assert(!(await request(catalogue)).data.formations.some(c=>c.slug===published.slug));await prisma.formation.update({where:{id:published.id},data:{publiee:true}});
  pass('public : visibilité administrée avec CSRF, date requise, conflit, masquage explicite et dépublication du parent immédiate');
  // Contenu HTML volontairement hostile uniquement dans la base jetable pour vérifier l’échappement React.
  await prisma.formation.update({where:{id:published.id},data:{objectifs:'Identifier les besoins du cheval. <img src=x onerror="window.CMH_XSS=true">'}});
}
