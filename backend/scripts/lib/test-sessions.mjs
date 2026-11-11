import assert from 'node:assert/strict';

export async function testSessions({prisma,client,pass}) {
  const admin=client(); assert.equal((await admin.login()).status,200);
  const member=client(); assert.equal((await member.login('member@auth-test.invalid')).status,200);
  const anon=client(),root='/api/admin/sessions';
  async function write(route,body,method='POST',agent=admin,csrf=true) {
    if(csrf)await agent.token();
    return agent.request(route,{method,headers:{'Content-Type':'application/json',...(csrf?{'x-csrf-token':agent.csrf}:{})},body:JSON.stringify(body)});
  }
  async function read(id){const r=await admin.request(`${root}/${id}`);assert.equal(r.status,200);return(await r.json()).item;}
  const formation=await prisma.formation.create({data:{titre:'Formation sessions 14 heures',dureeMinutes:840}});
  const row=(day,start='09:00',end='12:30')=>({debutLocal:`2026-11-${day}T${start}`,finLocal:`2026-11-${day}T${end}`});
  const data={formationId:formation.id,capacite:12,lieu:'Salle de test isolée',modalitesPratiques:'Accueil quinze minutes avant',seances:['02','09','16','23'].map(day=>row(day))};
  for(const [agent,status]of[[anon,401],[member,403]]) {
    for(const path of[root,`${root}/options`,`${root}/absent`,`${root}/absent/acces-prive`])assert.equal((await agent.request(path)).status,status);
    for(const [path,body,method]of[[root,data,'POST'],[`${root}/absent`,data,'PUT'],[`${root}/absent/acces-prive`,{},'PUT'],[`${root}/verifier-horaires`,data,'POST']])assert.equal((await write(path,body,method,agent)).status,status);
  }
  assert.equal((await write(root,data,'POST',admin,false)).status,403);
  assert.equal((await write(`${root}/verifier-horaires`,{formationId:formation.id,seances:data.seances},'POST',admin,false)).status,403);
  const created=await write(root,data);assert.equal(created.status,201);let item=(await created.json()).item;
  assert.equal(item.totalMinutes,840);assert.equal(item.durationMismatch,false);assert.equal(item.seances.length,4);
  assert.equal(item.seances[0].debut,'2026-11-02T08:00:00.000Z');assert.equal(item.formation.publiee,false);
  const payload=()=>({...data,seances:item.seances.map(s=>({id:s.id,debutLocal:s.debutLocal,finLocal:s.finLocal,debutOffset:s.debutOffset,finOffset:s.finOffset})),updatedAt:item.updatedAt});
  const originalId=item.id;
  pass('sessions : 401/403 et CSRF ; brouillon avec quatre séances de 3 h 30, stockage UTC et durée 14 h');
  for(const [name,change]of[
    ['capacité nulle',{capacite:0}],['capacité négative',{capacite:-1}],['fraction',{capacite:1.5}],['formation absente',{formationId:'absent'}],['champ interdit',{participants:[]}],
    ['date invalide',{seances:[{debutLocal:'2026-02-30T09:00',finLocal:'2026-02-30T10:00'}]}],
    ['fin égale',{seances:[row('02','09:00','09:00')]}],['fin avant',{seances:[row('02','09:00','08:00')]}],
    ['chevauchement',{seances:[row('02'),row('02','12:00','14:00')]}],
    ['heure inexistante',{seances:[{debutLocal:'2026-03-29T02:30',finLocal:'2026-03-29T04:00'}]}],
    ['heure ambiguë',{seances:[{debutLocal:'2026-10-25T02:15',finLocal:'2026-10-25T03:30'}]}],
    ['décalage incorrect',{seances:[{...row('02'),debutOffset:'+02:00'}]}],
  ]) {const r=await write(root,{...data,...change});assert.equal(r.status,422,name);assert((await r.json()).error);}
  const ambiguous=await write(root,{...data,seances:[{debutLocal:'2026-10-25T02:15',finLocal:'2026-10-25T03:30'}]});assert((await ambiguous.json()).fields['seances.0.debutOffset']);
  const dst=await write(root,{formationId:formation.id,seances:[{debutLocal:'2026-10-25T02:30',debutOffset:'+02:00',finLocal:'2026-10-25T02:30',finOffset:'+01:00'}]});assert.equal(dst.status,201);
  const autumn=(await dst.json()).item;assert.equal(autumn.totalMinutes,60);assert.equal(autumn.seances[0].debut,'2026-10-25T00:30:00.000Z');assert.equal(autumn.seances[0].fin,'2026-10-25T01:30:00.000Z');assert(autumn.durationMismatch);
  assert.equal((await write(root,{formationId:formation.id,seances:[row('02','09:00','10:00'),row('02','10:00','11:00')]})).status,201);
  pass('sessions : capacités, dates, fins, chevauchements et champs interdits refusés ; transitions été/hiver et séances contiguës vérifiées');
  const before=await read(item.id);
  assert.equal((await write(`${root}/${item.id}`,{...payload(),seances:[{...payload().seances[0],id:autumn.seances[0].id}]},'PUT')).status,422);
  assert.equal((await write(`${root}/${item.id}`,{...payload(),seances:[payload().seances[0],payload().seances[0]]},'PUT')).status,422);
  assert.deepEqual(await read(item.id),before);
  const previewCount=await prisma.session.count();const preview=await write(`${root}/verifier-horaires`,{formationId:formation.id,seances:[row('02')]});assert.equal(preview.status,200);assert.equal((await preview.json()).totalMinutes,210);assert.equal(await prisma.session.count(),previewCount);
  const update=await write(`${root}/${item.id}`,{...payload(),capacite:'15',seances:payload().seances.slice(0,3)},'PUT');assert.equal(update.status,200);item=(await update.json()).item;assert.equal(item.totalMinutes,630);assert(item.durationMismatch);assert.equal(item.seances.length,3);assert.equal(item.capacite,15);
  pass('sessions : modification transactionnelle, retrait de séance, références étrangères et doublons refusés ; prévisualisation sans écriture');
  assert.equal((await write(`${root}/${item.id}/acces-prive`,{updatedAt:item.updatedAt,consignes:'secret-consignes'},'PUT',admin,false)).status,403);
  const privateSave=await write(`${root}/${item.id}/acces-prive`,{updatedAt:item.updatedAt,consignes:'secret-consignes'},'PUT');assert.equal(privateSave.status,200);let privateBody=await privateSave.json();assert.equal(privateBody.accesPrive.lienVisioconference,null);
  const stale=item.updatedAt;item=await read(item.id);assert.notEqual(item.updatedAt,stale);
  assert.equal((await write(`${root}/${item.id}`,{...payload(),updatedAt:stale},'PUT')).status,409);
  assert.equal((await write(`${root}/${item.id}/acces-prive`,{updatedAt:item.updatedAt,lienVisioconference:'javascript:alert(1)'},'PUT')).status,422);
  const link='https://visio.invalid/secret-session-link';const privateUpdate=await write(`${root}/${item.id}/acces-prive`,{updatedAt:item.updatedAt,lienVisioconference:link,consignes:'secret-consignes'},'PUT');assert.equal(privateUpdate.status,200);privateBody=await privateUpdate.json();
  assert.equal((await(await admin.request(`${root}/${item.id}/acces-prive`)).json()).accesPrive.lienVisioconference,link);
  for(const route of[root,`${root}/${item.id}`,'/api/formations','/api/admin/formations',`${root}/options`]){const r=await admin.request(route);assert.equal(r.status,200);const s=JSON.stringify(await r.json());assert(!s.includes('secret-session-link')&&!s.includes('secret-consignes'));}
  assert.equal((await(await admin.request(`${root}?q=secret-session-link`)).json()).total,0);
  item=await read(item.id);
  assert.equal((await write(`${root}/${item.id}/acces-prive`,{updatedAt:stale,consignes:'écrasement'},'PUT')).status,409);
  const race=await Promise.all([write(`${root}/${item.id}`,{...payload(),lieu:'Révision A'},'PUT'),write(`${root}/${item.id}`,{...payload(),lieu:'Révision B'},'PUT')]);assert.deepEqual(race.map(r=>r.status).sort(),[200,409]);
  const publicData=await(await anon.request('/api/formations')).json();for(const f of publicData.formations)assert.deepEqual(Object.keys(f).sort(),['description','id','titre']);assert(!publicData.formations.some(f=>f.id===formation.id));
  pass('sessions : accès privés séparés, consignes seules, confidentialité listes/détails/public/recherche et conflits parent/privé/simultanés');
  for(let n=0;n<21;n++)assert.equal((await write(root,{formationId:formation.id,lieu:`PaginationSession ${n}`})).status,201);
  const first=await(await admin.request(`${root}?q=PaginationSession&formationId=${formation.id}`)).json(),second=await(await admin.request(`${root}?q=PaginationSession&page=2`)).json();assert.equal(first.total,21);assert.equal(first.items.length,20);assert.equal(second.items.length,1);
  assert.equal((await admin.request(`${root}/absent`)).status,404);assert.equal((await write(`${root}/absent`,{...payload()},'PUT')).status,404);assert.equal((await write(`${root}/absent/acces-prive`,{updatedAt:item.updatedAt},'PUT')).status,404);
  await admin.token();assert.equal((await admin.request(`${root}/${originalId}`,{method:'DELETE',headers:{'x-csrf-token':admin.csrf}})).status,405);assert.equal((await admin.request(`${root}/${originalId}`)).status,200);
  pass('sessions : recherche, filtre, pagination, identifiants inconnus et absence de suppression physique');
}
