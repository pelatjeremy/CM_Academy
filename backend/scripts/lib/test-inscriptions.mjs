import assert from 'node:assert/strict';

export async function testInscriptions({prisma, client, pass}) {
  const publicClient = client();
  const admin = client();
  const member = client();
  assert.equal((await admin.login()).status, 200);
  assert.equal((await member.login('member@auth-test.invalid')).status, 200);
  const formation = await prisma.formation.create({
    data: { titre: 'Préinscriptions — essai isolé', slug: 'preinscriptions-essai', publiee: true },
  });
  const draft = await prisma.formation.create({
    data: { titre: 'Brouillon', slug: 'preinscriptions-brouillon', publiee: false },
  });
  const day = 86400000;
  async function session(lieu, config = {}, offset = day * 30) {
    const debut = new Date(Date.now() + offset);
    return prisma.session.create({ data: {
      lieu, formationId: formation.id, visiblePubliquement: true,
      ...config, seances: { create: { debut, fin: new Date(debut.getTime() + 3600000) } },
    }});
  }
  const ouverte = await session('Session à capacité limitée', { preinscriptionsOuvertes: true, capacite: 1 });
  const fermee = await session('Session fermée');
  assert.equal(fermee.preinscriptionsOuvertes, false);
  const masquee = await session('Session masquée', { preinscriptionsOuvertes: true, visiblePubliquement: false });
  const passee = await session('Session passée', { preinscriptionsOuvertes: true }, -day);
  const nonPubliee = await session('Session du brouillon', { preinscriptionsOuvertes: true, formationId: draft.id });
  const sansDates = await prisma.session.create({
    data: { formationId: formation.id, visiblePubliquement: true, preinscriptionsOuvertes: true },
  });
  await prisma.sessionAccesPrive.create({
    data: { sessionId: ouverte.id, lienVisioconference: 'https://example.invalid/SECRET_VISIO', consignes: 'SECRET_CONSIGNES' },
  });
  const endpoint = id => '/api/sessions/' + id + '/preinscriptions';
  const form = {
    prenom: 'Élodie', nom: 'Desprès', email: 'elodie@example.invalid',
    typeDemande: 'PROFESSIONNEL_FINANCEMENT', organismeEnvisage: 'Organisme de test',
  };
  const secondForm = { prenom: 'Noé', nom: 'Leclerc', email: 'noe@example.invalid', typeDemande: 'PARTICULIER' };
  const envoyer = (id, body = form) => publicClient.request(endpoint(id), {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  const publicDetail = async () => (await (await publicClient.request('/api/formations/' + formation.slug)).json()).formation;
  assert.deepEqual((await publicDetail()).sessions.filter(s => s.preinscriptionSessionId).map(s => s.preinscriptionSessionId), [ouverte.id]);
  for (const s of [fermee, masquee, passee, nonPubliee, sansDates, {id: 'inconnue'}]) {
    assert.equal((await envoyer(s.id)).status, 404, s.lieu);
  }
  assert.equal((await envoyer(ouverte.id, {...form, email: 'invalide'})).status, 422);
  assert.equal((await envoyer(ouverte.id, {...form, typeDemande: 'PARTICULIER'})).status, 422);
  assert.equal((await envoyer(ouverte.id, {...form, statut: 'CONFIRMEE'})).status, 422);

  const twin = await Promise.all([
    envoyer(ouverte.id), envoyer(ouverte.id, {...form, email: ' ELODIE@EXAMPLE.INVALID '}),
  ]);
  for (const response of twin) {
    assert.equal(response.status, 202);
    assert.deepEqual(await response.json(), { message: 'Demande reçue, en attente de validation' });
  }
  assert.equal((await envoyer(ouverte.id, secondForm)).status, 202);
  assert.equal(await prisma.inscription.count({where: {sessionId: ouverte.id}}), 2);
  assert.equal(await prisma.inscription.count({where: {statut: 'CONFIRMEE'}}), 0);
  assert.equal(await prisma.changementInscription.count(), 2);
  pass('préinscriptions : défaut fermé, toutes les conditions vérifiées, validation et doublons simultanés sans divulgation');

  const catalogue = JSON.stringify(await publicDetail());
  for (const value of ['elodie@example.invalid', 'SECRET_VISIO', 'SECRET_CONSIGNES', 'Organisme de test', 'CONFIRMEE']) assert(!catalogue.includes(value));
  const base = '/api/admin/inscriptions';
  const rows = await prisma.inscription.findMany({where: {sessionId: ouverte.id}});
  const change = (who, row, statut, statutAttendu = 'EN_ATTENTE') => who.request(base + '/' + row.id + '/statut', {
    method: 'PUT', headers: {'Content-Type': 'application/json', 'x-csrf-token': who.csrf},
    body: JSON.stringify({statut, statutAttendu}),
  });
  assert.equal((await publicClient.request(base)).status, 401);
  assert.equal((await publicClient.request(base + '/' + rows[0].id)).status, 401);
  assert.equal((await member.request(base)).status, 403);
  assert.equal((await member.request(base + '/' + rows[0].id)).status, 403);
  await member.token();
  assert.equal((await change(member, rows[0], 'CONFIRMEE')).status, 403);
  admin.csrf = '';
  assert.equal((await change(admin, rows[0], 'CONFIRMEE')).status, 403);
  await admin.token();
  const filtered = await (await admin.request(base + '?q=' + encodeURIComponent('Élodie desprès') + '&sessionId=' + ouverte.id + '&statut=EN_ATTENTE')).json();
  assert.equal(filtered.total, 1);
  assert.equal(filtered.items[0].email, form.email);
  const detail = await (await admin.request(base + '/' + filtered.items[0].id)).json();
  assert.equal(detail.item.organismeEnvisage, form.organismeEnvisage);
  assert.equal(detail.item.historique.length, 1);
  assert(!JSON.stringify(detail).includes('SECRET_'));

  const confirms = await Promise.all(rows.map(row => change(admin, row, 'CONFIRMEE')));
  assert.deepEqual(confirms.map(result => result.status).sort(), [200, 409]);
  const confirmed = rows[confirms.findIndex(result => result.status === 200)];
  const pending = rows[confirms.findIndex(result => result.status === 409)];
  const conflict = await confirms.find(result => result.status === 409).json();
  assert.equal(conflict.code, 'COMPLETE');
  assert.equal((await change(admin, confirmed, 'CONFIRMEE')).status, 200);
  assert.equal(await prisma.changementInscription.count({where: {inscriptionId: confirmed.id}}), 2);
  assert.equal((await change(admin, confirmed, 'ANNULEE', 'CONFIRMEE')).status, 200);
  assert.equal((await change(admin, pending, 'CONFIRMEE')).status, 200);
  assert.equal(await prisma.inscription.count({where: {sessionId: ouverte.id, statut: 'CONFIRMEE'}}), 1);
  const history = (await (await admin.request(base + '/' + confirmed.id)).json()).item.historique;
  assert.deepEqual(history.map(event => event.nouveauStatut), ['EN_ATTENTE', 'CONFIRMEE', 'ANNULEE']);
  assert(history.slice(1).every(event => event.auteur?.email && Number.isFinite(Date.parse(event.date))));
  pass('préinscriptions : filtres, détail privé, droits, CSRF, dernière place en concurrence, annulation, audit et rejouabilité');

  const browser = await session('Session ouverte — essai navigateur', { preinscriptionsOuvertes: true }, day * 40);
  assert.equal((await envoyer(browser.id, {...secondForm, email: 'refus@example.invalid'})).status, 202);
  const refus = await prisma.inscription.findFirst({where: {sessionId: browser.id}});
  assert.equal((await change(admin, refus, 'REFUSEE')).status, 200);
  assert.equal((await change(admin, refus, 'CONFIRMEE')).status, 409);
  let limited;
  for (let index = 0; index < 21; index++) {
    limited = await envoyer(browser.id, {});
    if (limited.status === 429) break;
    assert.equal(limited.status, 422);
  }
  assert.equal(limited.status, 429);
  pass('préinscriptions : refus terminal et limitation des soumissions');
}
