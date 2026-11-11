import assert from 'node:assert/strict';

export async function testAdminCatalogue({ prisma, client, pass }) {
  const admin = client(); assert.equal((await admin.login()).status, 200);
  const member = client(); assert.equal((await member.login('member@auth-test.invalid')).status, 200);
  const anonymous = client();
  async function write(agent, path, method, data, csrf = true) {
    if (csrf) await agent.token();
    return agent.request(`/api/admin/${path}`, { method,
      headers: { 'Content-Type': 'application/json', ...(csrf ? { 'x-csrf-token': agent.csrf } : {}) }, body: JSON.stringify(data) });
  }
  for (const kind of ['poles', 'formateurs']) {
    const payload = kind === 'poles' ? { titre: '  Pôle API  ', slug: 'pole-api', description: 'Description test' }
      : { nom: '  Formateur API  ', biographie: 'Biographie test' };
    const normalized = Object.fromEntries(Object.entries(payload).map(([k,v])=>[k,v.trim()]));
    const listed = await admin.request(`/api/admin/${kind}`); assert.equal(listed.status,200);
    assert.deepEqual((await listed.json()).items,[]);
    for(const agent of [anonymous,member]) {
      const expected=agent===anonymous?401:403;
      assert.equal((await agent.request(`/api/admin/${kind}`)).status,expected);
      assert.equal((await agent.request(`/api/admin/${kind}/absent`)).status,expected);
      assert.equal((await write(agent,kind,'POST',payload)).status,expected);
      assert.equal((await write(agent,`${kind}/absent`,'PUT',payload)).status,expected);
    }
    assert.equal((await write(admin,kind,'POST',payload,false)).status,403);
    await admin.token();
    assert.equal((await admin.request(`/api/admin/${kind}`,{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':'invalide'},body:JSON.stringify(payload)})).status,403);
    const invalid=await write(admin,kind,'POST',kind==='poles'?{titre:' ',slug:'SLUG invalide'}:{nom:' '});
    assert.equal(invalid.status,422);assert(Object.keys((await invalid.json()).fields).length>0);
    assert.equal((await write(admin,kind,'POST',{...payload,email:'prive@invalid.test'})).status,422);
    assert.equal((await write(admin,kind,'POST',{...payload,[kind==='poles'?'description':'biographie']:'x'.repeat(3001)})).status,422);
    assert.equal((await admin.request(`/api/admin/${kind}/absent`)).status,404);
    assert.equal((await write(admin,`${kind}/absent`,'PUT',payload)).status,404);
    const created=await write(admin,kind,'POST',payload);assert.equal(created.status,201);
    const {item}=await created.json();assert(item.id);assert(item.updatedAt);
    for(const [key,value]of Object.entries(normalized))assert.equal(item[key],value);
    const detail=await admin.request(`/api/admin/${kind}/${item.id}`);assert.equal(detail.status,200);assert.deepEqual((await detail.json()).item,item);
    assert.equal((await write(admin,`${kind}/${item.id}`,'PUT',payload,false)).status,403);
    assert.equal((await write(admin,kind,'POST',normalized)).status,409);
    const modified=kind==='poles'?{...normalized,titre:'Pôle modifié API',slug:'pole-modifie-api'}:{...normalized,nom:'Formateur modifié API'};
    const updated=await write(admin,`${kind}/${item.id}`,'PUT',modified);assert.equal(updated.status,200);
    for(const [key,value]of Object.entries(modified))assert.equal((await (await admin.request(`/api/admin/${kind}/${item.id}`)).json()).item[key],value);
    assert.equal((await admin.request(`/api/admin/${kind}?q=MODIFI`)).status,200);
    assert.equal((await (await admin.request(`/api/admin/${kind}?q=MODIFI`)).json()).total,1);
    assert.equal((await (await admin.request(`/api/admin/${kind}?q=introuvable-xyz`)).json()).total,0);
    assert.equal((await admin.request(`/api/admin/${kind}?page=0`)).status,422);
    const secondData=kind==='poles'?{titre:'Autre pôle',slug:'autre-pole',description:''}:{nom:modified.nom,biographie:'Autre biographie : homonyme autorisé'};
    const second=await write(admin,kind,'POST',secondData);assert.equal(second.status,201);const secondItem=(await second.json()).item;
    assert.equal((await write(admin,`${kind}/${secondItem.id}`,'PUT',modified)).status,409);
    await admin.token();assert.equal((await admin.request(`/api/admin/${kind}/${item.id}`,{method:'DELETE',headers:{'x-csrf-token':admin.csrf}})).status,405);
    assert.equal((await admin.request(`/api/admin/${kind}/${item.id}`)).status,200);
    pass(`${kind} : lecture/création/modification, recherche, 401/403, CSRF, validation, doublons, 404 et suppression refusée`);
  }
  const concurrent={nom:'Formateur concurrence API',biographie:'Une seule fiche attendue'};
  await admin.token();
  const statuses=await Promise.all([write(admin,'formateurs','POST',concurrent),write(admin,'formateurs','POST',concurrent)]);
  assert.deepEqual(statuses.map(r=>r.status).sort(),[201,409]);
  assert.equal(await prisma.formateur.count({where:{nom:concurrent.nom}}),1);
  pass('doublon de formateur concurrent : une seule création, sans nouvelle contrainte de schéma');
  for(let n=0;n<21;n++) {
    const res=await write(admin,'poles','POST',{titre:`Pagination ${n}`,slug:`pagination-${n}`,description:''});assert.equal(res.status,201);
  }
  const first=(await (await admin.request('/api/admin/poles?q=Pagination&page=1')).json());
  const second=(await (await admin.request('/api/admin/poles?q=Pagination&page=2')).json());
  assert.equal(first.total,21);assert.equal(first.items.length,20);assert.equal(second.items.length,1);
  assert.equal(new Set([...first.items,...second.items].map(i=>i.id)).size,21);
  assert.equal((await admin.request('/api/formateurs')).status,404);
  assert.equal((await admin.request('/api/poles')).status,404);
  const catalog=await anonymous.request('/api/formations');assert.equal(catalog.status,200);
  for(const formation of (await catalog.json()).formations)assert.deepEqual(Object.keys(formation).sort(),['description','id','titre']);
  pass('pagination réelle et absence de nouvelles données de formateurs dans les routes publiques');
}
