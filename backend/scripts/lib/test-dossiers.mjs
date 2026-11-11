import assert from 'node:assert/strict';

export async function testDossiers({prisma, client, pass}) {
  const admin = client(), member = client(), anonymous = client();
  assert.equal((await admin.login()).status, 200);
  assert.equal((await member.login('member@auth-test.invalid')).status, 200);
  const formation = await prisma.formation.create({
    data: {titre: 'Dossier documentaire — essai isolé', slug: 'dossier-essai-isole', publiee: true, parcoursDocumentaire: true},
  });
  const debut = new Date(Date.now() + 40 * 86400000);
  const session = await prisma.session.create({
    data: {
      formationId: formation.id, visiblePubliquement: true, preinscriptionsOuvertes: true,
      seances: {create: {debut, fin: new Date(debut.getTime() + 3600000)}},
    },
  });
  const inscription = await prisma.inscription.create({
    data: {sessionId: session.id, prenom: 'Zoé', nom: 'Dossier Isolé', email: 'dossier-isole@example.invalid', typeDemande: 'PROFESSIONNEL_FINANCEMENT', organismeEnvisage: 'Organisme dossier'},
  });
  const url = id => '/api/admin/inscriptions/' + id + '/dossier';
  const root = url(inscription.id);
  async function write(route, body, method = 'PUT', agent = admin, csrf = true) {
    if (csrf) await agent.token();
    return agent.request(route, {
      method, headers: {'Content-Type': 'application/json', ...(csrf ? {'x-csrf-token': agent.csrf} : {})},
      body: JSON.stringify(body),
    });
  }
  async function read(id = inscription.id) {
    const response = await admin.request(url(id));
    assert.equal(response.status, 200);
    return (await response.json()).item;
  }
  const counts = async () => [await prisma.dossierAdministratif.count(), await prisma.elementDocumentaire.count(), await prisma.changementDocumentaire.count()];
  const before = await counts();
  assert.equal((await read()).dossier, null);
  assert.deepEqual(await counts(), before);
  for (const [agent, status] of [[anonymous, 401], [member, 403]]) {
    assert.equal((await agent.request(root)).status, status);
    assert.equal((await write(root + '/initialiser', {}, 'POST', agent)).status, status);
    assert.equal((await write(root, {}, 'PUT', agent)).status, status);
  }
  assert.equal((await write(root + '/initialiser', {}, 'POST', admin, false)).status, 403);
  const initialized = await Promise.all([
    write(root + '/initialiser', {}, 'POST'), write(root + '/initialiser', {}, 'POST'),
  ]);
  assert(initialized.every(response => response.status === 200));
  let item = await read();
  assert(item.dossier.parcoursDocumentaire);
  assert.equal(item.dossier.elements.length, 10);
  assert(item.dossier.elements.every(element => element.etat === 'A_PREPARER' && element.note === '' && element.historique.length === 0));
  assert.equal(await prisma.dossierAdministratif.count({where: {inscriptionId: inscription.id}}), 1);
  const loadedCounts = await counts();
  const loadedVersion = item.dossier.updatedAt;
  await read();await read();
  assert.deepEqual(await counts(), loadedCounts);
  assert.equal((await read()).dossier.updatedAt, loadedVersion);
  pass('dossiers : lecture sans écriture, création unique simultanée, dix catégories, 401/403 et CSRF initialisation');

  const change = {categorie: 'ENTRETIEN_INITIAL', etat: 'EN_ATTENTE', note: 'Note privée de dossier'};
  const payload = () => ({updatedAt: item.dossier.updatedAt, elements: [change]});
  assert.equal((await write(root, payload(), 'PUT', admin, false)).status, 403);
  for (const invalid of [
    {...payload(), parcoursDocumentaire: false},
    {...payload(), auteurId: 'inventé'},
    {...payload(), elements: [{...change, etat: 'SIGNE'}]},
    {...payload(), elements: [{...change, note: 'x'.repeat(501)}]},
    {...payload(), elements: [change, change]},
    {...payload(), updatedAt: 'invalide'},
    {...payload(), elements: [{...change, note: 'nul\0'}]},
  ]) assert.equal((await write(root, invalid)).status, 422);
  let response = await write(root, payload());assert.equal(response.status, 200);
  item = (await response.json()).item;
  let element = item.dossier.elements.find(row => row.categorie === change.categorie);
  assert.equal(element.historique.length, 1);
  assert.equal(element.historique[0].auteur.email, 'admin@auth-test.invalid');
  assert.equal(element.historique[0].ancienneNote, '');
  assert.equal(element.historique[0].nouvelleNote, change.note);
  assert.equal(element.historique[0].date, item.dossier.updatedAt);
  for (const etat of ['RECU', 'VERIFIE', 'NON_APPLICABLE', 'A_PREPARER']) {
    response = await write(root, {updatedAt: item.dossier.updatedAt, elements: [{...change, etat}]});
    assert.equal(response.status, 200);item = (await response.json()).item;
  }
  const version = item.dossier.updatedAt;
  response = await write(root, {updatedAt: version, elements: [{...change, etat: 'A_PREPARER'}]});
  assert.equal(response.status, 200);assert.equal((await response.json()).item.dossier.updatedAt, version);
  assert.equal((await write(root, {updatedAt: loadedVersion, elements: [change]})).status, 409);
  const race = await Promise.all([
    write(root, {updatedAt: version, elements: [{...change, note: 'Concurrent A'}]}),
    write(root, {updatedAt: version, elements: [{...change, note: 'Concurrent B'}]}),
  ]);
  assert.deepEqual(race.map(row => row.status).sort(), [200, 409]);
  item = await read();
  element = item.dossier.elements.find(row => row.categorie === change.categorie);
  assert.equal(element.historique.length, 6);
  const stable = item.dossier;
  await prisma.formation.update({where: {id: formation.id}, data: {parcoursDocumentaire: false}});
  assert.deepEqual((await read()).dossier, stable);
  await write(root + '/initialiser', {}, 'POST');
  assert.deepEqual((await read()).dossier, stable);
  pass('dossiers : états, notes, audit auteur/date, sauvegarde sans effet, conflits concurrents et conservation après modification de formation');

  for (const statut of ['EN_ATTENTE', 'CONFIRMEE', 'REFUSEE', 'ANNULEE']) {
    const row = await prisma.inscription.create({
      data: {sessionId: session.id, prenom: 'Dossier', nom: statut, email: statut.toLowerCase() + '@dossier.invalid', typeDemande: 'PARTICULIER', statut},
    });
    assert.equal((await write(url(row.id) + '/initialiser', {}, 'POST')).status, 200);
    const disabled = await read(row.id);
    assert.equal(disabled.statut, statut);
    assert.equal(disabled.dossier.parcoursDocumentaire, false);
    assert.equal(disabled.dossier.elements.length, 0);
    assert.equal((await write(url(row.id), {updatedAt: disabled.dossier.updatedAt, elements: [change]})).status, 422);
  }
  await prisma.formation.update({where: {id: formation.id}, data: {parcoursDocumentaire: true}});
  const disabledRow = await prisma.inscription.findFirst({where: {email: 'annulee@dossier.invalid'}});
  assert.equal((await read(disabledRow.id)).dossier.parcoursDocumentaire, false);

  const publicResponse = await anonymous.request('/api/sessions/' + session.id + '/preinscriptions', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({prenom: 'Nouveau', nom: 'Dossier', email: 'nouveau-dossier@example.invalid', typeDemande: 'PARTICULIER'}),
  });
  assert.equal(publicResponse.status, 202);
  const automatic = await prisma.inscription.findUnique({where: {sessionId_email: {sessionId: session.id, email: 'nouveau-dossier@example.invalid'}}, include: {dossier: {include: {elements: true}}}});
  assert.equal(automatic.dossier.elements.length, 10);
  for (const route of ['/api/formations', '/api/catalogue/formations', '/api/formations/' + formation.slug]) {
    const result = await anonymous.request(route);assert.equal(result.status, 200);
    const body = JSON.stringify(await result.json());
    for (const word of ['dossier-isole@example.invalid', 'Concurrent A', 'Concurrent B', 'ancienneNote', 'nouvelleNote', 'elements', 'historique']) assert(!body.includes(word));
  }
  assert.equal((await admin.request(url('absent'))).status, 404);
  assert.equal((await write(url('absent') + '/initialiser', {}, 'POST')).status, 404);
  assert.equal((await write(url('absent'), payload())).status, 404);
  await admin.token();
  assert.equal((await admin.request(root, {method: 'DELETE', headers: {'x-csrf-token': admin.csrf}})).status, 404);
  pass('dossiers : tous les statuts, parcours désactivé conservé, dossier automatique au dépôt, absence de suppression et confidentialité publique');
}
