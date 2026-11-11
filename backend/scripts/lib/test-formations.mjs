import assert from 'node:assert/strict';

export async function testFormations({ prisma, client, pass }) {
  const admin = client(); assert.equal((await admin.login()).status, 200);
  const member = client(); assert.equal((await member.login('member@auth-test.invalid')).status, 200);
  const anonymous = client();
  const root = '/api/admin/formations';
  async function write(path, body, method = 'POST', agent = admin, csrf = true) {
    if (csrf) await agent.token();
    return agent.request(path, { method, headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': agent.csrf } : {}) }, body: JSON.stringify(body) });
  }
  async function read(id) { const response = await admin.request(`${root}/${id}`); assert.equal(response.status, 200); return (await response.json()).item; }
  const draft = { titre: 'Brouillon formation API' };
  for (const [agent, status] of [[anonymous, 401], [member, 403]]) {
    for (const path of [root, `${root}/options`, `${root}/absent`]) assert.equal((await agent.request(path)).status, status);
    assert.equal((await write(root, draft, 'POST', agent)).status, status);
    assert.equal((await write(`${root}/absent`, { ...draft, updatedAt: new Date().toISOString() }, 'PUT', agent)).status, status);
    assert.equal((await write(`${root}/absent/publication`, { publiee: true, updatedAt: new Date().toISOString() }, 'POST', agent)).status, status);
  }
  assert.equal((await write(root, draft, 'POST', admin, false)).status, 403);
  await admin.token();
  assert.equal((await admin.request(root, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-csrf-token': 'invalide' }, body: JSON.stringify(draft) })).status, 403);
  assert.equal((await write(root, { ...draft, publiee: true })).status, 422);
  assert.equal((await write(root, { ...draft, sessions: [] })).status, 422);
  assert.equal((await write(root, {})).status, 422);
  const created = await write(root, draft); assert.equal(created.status, 201); let item = (await created.json()).item;
  assert.equal(item.publiee, false); assert.equal(item.slug, null); assert.equal(item.tarif, null); assert.deepEqual(item.formateurIds, []);
  assert(item.publication.missing.some(m => m.field === 'programme'));
  const originalId = item.id;
  const defaultCurrency = await write(root, { titre: 'Brouillon devise par défaut', devise: '' });
  assert.equal(defaultCurrency.status, 201); assert.equal((await defaultCurrency.json()).item.devise, 'EUR');
  assert.equal((await write(`${root}/${item.id}`, { titre: 'Brouillon incomplet modifié', updatedAt: item.updatedAt }, 'PUT')).status, 200);
  item = await read(item.id);
  assert.equal((await write(`${root}/${item.id}`, { ...draft }, 'PUT')).status, 422);
  assert.equal((await write(`${root}/${item.id}/publication`, { publiee: true, updatedAt: item.updatedAt }, 'POST', admin, false)).status, 403);
  const incomplete = await write(`${root}/${item.id}/publication`, { publiee: true, updatedAt: item.updatedAt });
  assert.equal(incomplete.status, 422); const missing = (await incomplete.json()).fields;
  for (const key of ['slug','description','objectifs','programme','publicVise','prerequis','format','dureeMinutes','poleId','formateurIds']) assert(missing[key]);
  pass('formations : brouillon incomplet créé/modifié, création publiée interdite, 401/403 et CSRF vérifiés');

  const pole = await prisma.pole.create({ data: { titre: 'Pôle formations test', slug: 'pole-formations-test' } });
  const trainers = await Promise.all(['Formatrice Formation A','Formateur Formation B'].map(nom => prisma.formateur.create({ data: { nom } })));
  const complete = { titre: 'Formation référence API', slug: 'formation-reference-api', resume: '', description: 'Présentation exploitable',
    objectifs: 'Acquérir des connaissances', programme: 'Programme pédagogique détaillé', publicVise: 'Professionnels du cheval', prerequis: 'Aucun prérequis',
    format: 'WEBINAIRE', dureeMinutes: 840, poleId: pole.id, formateurIds: trainers.map(t => t.id), tarif: null, devise: 'EUR', financement: '', parcoursDocumentaire: true };
  for (const [name, changes] of [
    ['slug invalide',{slug:'Slug invalide'}], ['pôle absent',{poleId:'absent'}], ['formateur absent',{formateurIds:['absent']}],
    ['association dupliquée',{formateurIds:[trainers[0].id,trainers[0].id]}], ['durée nulle',{dureeMinutes:0}], ['durée négative',{dureeMinutes:-1}],
    ['durée fractionnaire',{dureeMinutes:'3.5'}], ['format inconnu',{format:'INCONNU'}], ['devise invalide',{devise:'eur'}],
    ['tarif négatif',{tarif:'-0.01'}], ['tarif arrondi interdit',{tarif:'0.001'}], ['tarif flottant interdit',{tarif:123.45}], ['tarif hors précision',{tarif:'10000000000.00'}],
  ]) assert.equal((await write(root, { ...complete, ...changes })).status, 422, name);
  const associated = await write(`${root}/${item.id}`, { ...complete, updatedAt: item.updatedAt }, 'PUT'); assert.equal(associated.status, 200);
  item = (await associated.json()).item; assert.equal(item.poleId, pole.id); assert.equal(item.formateurIds.length, 2);
  assert.equal(await prisma.formationFormateur.count({ where: { formationId: item.id } }), 2);
  for (const trainer of item.formateurs) assert.deepEqual(Object.keys(trainer).sort(), ['id','nom']);
  const prior = await read(item.id);
  assert.equal((await write(`${root}/${item.id}`, { ...complete, titre:'Ne doit pas être enregistré', formateurIds:['absent'], updatedAt:item.updatedAt }, 'PUT')).status,422);
  assert.deepEqual(await read(item.id), prior);
  assert.equal((await write(root, { ...complete, titre:'Slug en doublon' })).status,409);
  const other = (await (await write(root, { titre:'Autre brouillon', slug:'autre-brouillon-api' })).json()).item;
  assert.equal((await write(`${root}/${other.id}`, { ...complete, updatedAt:other.updatedAt }, 'PUT')).status,409);
  assert.equal((await admin.request(`${root}/absent`)).status,404);
  assert.equal((await write(`${root}/absent`, { ...draft, updatedAt:new Date().toISOString() }, 'PUT')).status,404);
  assert.equal((await write(`${root}/absent/publication`, { publiee:true, updatedAt:new Date().toISOString() })).status,404);
  pass('formations : associations transactionnelles, doublons, références, validation et absence de modification partielle');

  for (const amount of ['0','1234,56','9999999999.99',null]) {
    const result = await write(`${root}/${item.id}`, { ...complete, tarif:amount, updatedAt:item.updatedAt }, 'PUT'); assert.equal(result.status,200);
    item = (await result.json()).item;
    assert.equal(item.tarif, amount===null?null:amount==='0'?'0.00':amount.replace(',','.'));
  }
  pass('formations : tarif absent distinct du gratuit, montants exacts et virgule décimale, aucun arrondi silencieux');
  const privateSession = await prisma.session.create({ data:{formationId:item.id} });
  await prisma.sessionAccesPrive.create({ data:{sessionId:privateSession.id,lienVisioconference:'https://visio.invalid/secret-formation-test'} });
  const publicIds = async () => {
    const response=await anonymous.request('/api/formations'); assert.equal(response.status,200); const data=await response.json();
    assert(!JSON.stringify(data).includes('secret-formation-test'));
    for(const row of data.formations)assert.deepEqual(Object.keys(row).sort(),['description','id','titre']);
    return data.formations.map(row=>row.id);
  };
  assert(!(await publicIds()).includes(item.id));
  let response=await write(`${root}/${item.id}/publication`,{publiee:true,updatedAt:item.updatedAt});assert.equal(response.status,200);item=(await response.json()).item;
  assert(item.publiee);assert((await publicIds()).includes(item.id));
  assert(!('sessions' in item));assert(!JSON.stringify(item).includes('secret-formation-test'));
  assert.equal((await write(`${root}/${item.id}`,{...complete,description:'',updatedAt:item.updatedAt},'PUT')).status,422);
  assert.equal((await read(item.id)).description,complete.description);
  const published=(await (await admin.request(`${root}?q=référence&poleId=${pole.id}&publication=publiee`)).json());assert.equal(published.total,1);
  assert.equal((await (await admin.request(`${root}?q=référence&publication=brouillon`)).json()).total,0);
  const staleVersion=item.updatedAt;
  response=await write(`${root}/${item.id}`,{...complete,titre:'Formation référence API révisée',updatedAt:item.updatedAt},'PUT');assert.equal(response.status,200);item=(await response.json()).item;
  assert(new Date(item.updatedAt)>new Date(staleVersion));
  response=await write(`${root}/${item.id}`,{...complete,titre:'Écrasement interdit',updatedAt:staleVersion},'PUT');assert.equal(response.status,409);assert.equal((await response.json()).code,'CONFLICT');
  assert.equal((await write(`${root}/${item.id}/publication`,{publiee:false,updatedAt:staleVersion})).status,409);
  assert((await publicIds()).includes(item.id));
  response=await write(`${root}/${item.id}/publication`,{publiee:false,updatedAt:item.updatedAt});assert.equal(response.status,200);item=(await response.json()).item;
  assert(!item.publiee);assert(!(await publicIds()).includes(item.id));
  pass('formations : publication complète puis dépublication, fiche publiée protégée et contrat public sans accès privé');
  const concurrent = await Promise.all([
    write(`${root}/${item.id}`,{...complete,titre:'Révision A',updatedAt:item.updatedAt},'PUT'),
    write(`${root}/${item.id}`,{...complete,titre:'Révision B',updatedAt:item.updatedAt},'PUT'),
  ]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  const winner=await read(item.id);assert(['Révision A','Révision B'].includes(winner.titre));
  assert.equal(await prisma.formationFormateur.count({where:{formationId:item.id}}),2);
  pass('formations : deux modifications simultanées, une réussite et un conflit, associations conservées');
  for(let n=0;n<21;n++)assert.equal((await write(root,{titre:`PaginationFormation ${n}`,poleId:pole.id})).status,201);
  const first=(await (await admin.request(`${root}?q=PaginationFormation&poleId=${pole.id}&publication=brouillon&page=1`)).json());
  const second=(await (await admin.request(`${root}?q=PaginationFormation&page=2`)).json());
  assert.equal(first.total,21);assert.equal(first.items.length,20);assert.equal(second.items.length,1);
  const choices=(await (await admin.request(`${root}/options`)).json());assert(choices.poles.some(p=>p.id===pole.id));assert(choices.formateurs.some(f=>f.id===trainers[0].id));
  for(const trainer of choices.formateurs)assert.deepEqual(Object.keys(trainer).sort(),['id','nom']);
  await admin.token();assert.equal((await admin.request(`${root}/${originalId}`,{method:'DELETE',headers:{'x-csrf-token':admin.csrf}})).status,405);
  assert.equal((await admin.request(`${root}/${originalId}`)).status,200);
  pass('formations : recherche, filtres combinés, pagination, options sûres et suppression refusée');
}
