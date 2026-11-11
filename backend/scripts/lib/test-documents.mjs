import assert from 'node:assert/strict';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {request} from 'node:http';
import {mkdir, readdir, writeFile, rename, unlink, utimes, readFile} from 'node:fs/promises';
import {createDocumentStorage} from '../../lib/documents.js';
import {initialiserDossier} from '../../lib/dossiers.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1cAAAAASUVORK5CYII=', 'base64');
const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABBQJ//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAwEBPwF//8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAgBAgEBPwF//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQAGPwJ//8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPyF//9oADAMBAAIAAwAAABD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==','base64');
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 0 /Kids [] >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');

async function until(check) {
  for (let count = 0; count < 100; count++) {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.fail('Condition de nettoyage non atteinte.');
}

export async function testDocuments({prisma, client, pass, base, storageRoot, run, restart}) {
  const admin = client(), member = client(), anon = client();
  assert.equal((await admin.login()).status, 200);
  assert.equal((await member.login('member@auth-test.invalid')).status, 200);
  const formation = await prisma.formation.create({data: {
    titre: 'Pièces jointes — essai isolé', slug: 'pieces-jointes-essai', publiee: true, parcoursDocumentaire: true,
  }});
  const session = await prisma.session.create({data: {formationId: formation.id}});
  const inscription = await prisma.inscription.create({data: {
    sessionId: session.id, prenom: 'Alice', nom: 'Fichiers Isolés', email: 'fichiers@example.invalid', typeDemande: 'PARTICULIER',
  }});
  await prisma.$transaction(tx => initialiserDossier(tx, inscription.id));
  const route = categorie => '/api/admin/inscriptions/' + inscription.id + '/dossier/elements/' + categorie + '/fichiers';
  const root = route('PROGRAMME');
  async function upload({who = admin, url = root, bytes = pdf, type = 'application/pdf', name = 'programme.pdf', revision = 0, depotId = randomUUID(), csrf = true, extraFile = false, extraField = false} = {}) {
    if (csrf) await who.token();
    const form = new FormData();
    form.append('fichier', new Blob([bytes], {type}), name);
    if (extraFile) form.append('fichier', new Blob([png], {type: 'image/png'}), 'autre.png');
    if (extraField) form.append('note', 'champ interdit');
    return who.request(url, {
      method: 'POST',
      headers: {'x-depot-id': depotId, 'x-fichier-revision': String(revision), ...(csrf ? {'x-csrf-token': who.csrf} : {})},
      body: form,
    });
  }
  async function versions(url = root) { const r = await admin.request(url); assert.equal(r.status,200); return r.json(); }
  const store = createDocumentStorage({root: storageRoot});
  for (const [who,status] of [[anon,401],[member,403]]) {
    assert.equal((await who.request(root)).status,status);
    assert.equal((await who.request(root + '/inconnu/telecharger')).status,status);
    assert.equal((await upload({who})).status,status);
  }
  assert.equal((await upload({csrf:false})).status,403);
  assert.equal(await prisma.pieceJointe.count(),0);
  assert.equal((await upload({bytes:png,type:'application/pdf'})).status,422);
  assert.equal((await upload({name:'image.exe',bytes:png,type:'image/png'})).status,422);
  assert.equal((await upload({bytes:Buffer.from('faux contenu PDF')})).status,422);
  assert.equal((await upload({bytes:Buffer.alloc(0)})).status,422);
  assert.equal((await upload({extraFile:true})).status,422);
  assert.equal((await upload({extraField:true})).status,422);
  assert.equal((await upload({bytes:Buffer.alloc(10485761,65)})).status,413);
  assert.deepEqual(await readdir(path.join(storageRoot,'temporaires')),[]);
  assert.equal(await prisma.pieceJointe.count(),0);
  pass('fichiers : ADMIN/401/403, CSRF multipart avant stockage, extension/type/signature, fichiers multiples et limite 10 Mo');

  const old = await prisma.dossierAdministratif.findUnique({where:{inscriptionId:inscription.id}});
  const token = randomUUID();
  let r = await upload({depotId:token});assert.equal(r.status,201);
  const first = (await r.json()).file;
  assert.equal(first.version,1);
  assert.deepEqual(Object.keys(first).sort(),['id','version','nomOriginal','taille','typeMime','date','auteur','partageStagiaire','partageRevision','historiquePartages'].sort());
  assert.deepEqual(Object.keys(first.auteur),['email']);
  r = await upload({depotId:token});assert.equal(r.status,200);assert.equal((await r.json()).file.id,first.id);
  assert.equal((await upload({depotId:token,bytes:Buffer.concat([pdf,Buffer.from('\nchangement')])})).status,409);
  assert.equal((await upload({revision:1,bytes:png,type:'image/png',name:'image.png'})).status,201);
  assert.equal((await upload({revision:2,bytes:jpeg,type:'image/jpeg',name:'photo.jpg'})).status,201);
  const malicious = '../../document"\r\nX-Evil: yes.pdf';
  r=await upload({revision:3,name:malicious});assert.equal(r.status,201);
  const last=(await r.json()).file;
  assert(!/[\\/\r\n]/.test(last.nomOriginal));
  const list=await versions();assert.equal(list.revision,4);assert.equal(list.versions.length,4);
  const download=await admin.request(root+'/'+first.id+'/telecharger');
  assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'application/pdf');
  assert.equal(download.headers.get('x-content-type-options'),'nosniff');
  assert(download.headers.get('content-disposition').startsWith('attachment;'));
  assert.deepEqual(Buffer.from(await download.arrayBuffer()),pdf);
  const unsafeHeader=await admin.request(root+'/'+last.id+'/telecharger');
  assert.equal(unsafeHeader.status,200);assert.equal(unsafeHeader.headers.get('x-evil'),null);await unsafeHeader.arrayBuffer();
  assert.equal((await admin.request(route('ATTESTATION')+'/'+first.id+'/telecharger')).status,404);
  assert.equal((await admin.request(root.replace(inscription.id,'inconnu')+'/'+first.id+'/telecharger')).status,404);
  const current=await prisma.dossierAdministratif.findUnique({where:{inscriptionId:inscription.id}});
  assert.deepEqual(current,old);
  const manual=await prisma.elementDocumentaire.findUnique({where:{inscriptionId_categorie:{inscriptionId:inscription.id,categorie:'PROGRAMME'}}});
  assert.equal(manual.etat,'A_PREPARER');assert.equal(manual.note,'');
  const detail=await(await admin.request('/api/admin/inscriptions/'+inscription.id+'/dossier')).json();
  assert.equal(detail.item.dossier.elements.find(e=>e.categorie==='PROGRAMME').fichiers.length,4);
  assert(!JSON.stringify(detail).includes('stockageKey'));
  pass('fichiers : PDF/JPEG/PNG, téléchargement historique, métadonnées, en-têtes sûrs, nom malveillant et états manuels indépendants');

  const race=await Promise.all([upload({revision:4,name:'concurrent-a.pdf'}),upload({revision:4,name:'concurrent-b.pdf'})]);
  assert.deepEqual(race.map(row=>row.status).sort(),[201,409]);
  const replayToken=randomUUID();
  const retries=await Promise.all([upload({revision:5,depotId:replayToken}),upload({revision:5,depotId:replayToken})]);
  assert(retries.every(row=>[200,201].includes(row.status)));
  const ids=await Promise.all(retries.map(async row=>(await row.json()).file.id));assert.equal(ids[0],ids[1]);
  assert.equal((await versions()).revision,6);

  // Échec confirmé avant commit, puis perte de réponse après commit : aucun fichier référencé n'est supprimé.
  const original=prisma.$transaction.bind(prisma);
  prisma.$transaction=async (...args)=>{if(typeof args[0]==='function')throw new Error('TEST_STORAGE_TX');return original(...args);};
  try{assert.equal((await upload({revision:6})).status,503);}finally{prisma.$transaction=original;}
  assert.equal((await versions()).revision,6);
  let uncertain=true;
  prisma.$transaction=async (...args)=>{
    const result=await original(...args);
    if(uncertain&&typeof args[0]==='function'){uncertain=false;throw new Error('TEST_COMMIT_RESPONSE');}
    return result;
  };
  const recoveryToken=randomUUID();
  try{assert.equal((await upload({revision:6,depotId:recoveryToken})).status,503);}finally{prisma.$transaction=original;}
  r=await upload({revision:6,depotId:recoveryToken});assert.equal(r.status,200);
  const recovered=(await r.json()).file;
  const recoveredDownload=await admin.request(root+'/'+recovered.id+'/telecharger');assert.equal(recoveredDownload.status,200);await recoveredDownload.arrayBuffer();

  const objects=path.join(storageRoot,'objets'), saved=path.join(storageRoot,'objets-test-indisponibles');
  await rename(objects,saved);await writeFile(objects,'test');
  try{assert.equal((await upload({revision:7})).status,503);}finally{await unlink(objects);await rename(saved,objects);}
  const audit=await store.audit(prisma,{ageMs:0});
  assert.deepEqual(audit.orphelins,[]);assert.deepEqual(audit.manquants,[]);assert.deepEqual(audit.alteres,[]);
  assert.deepEqual(await readdir(path.join(storageRoot,'temporaires')),[]);
  pass('fichiers : versions concurrentes, double dépôt idempotent, panne stockage, rollback et réponse perdue après commit');

  await admin.token();
  const boundary='test-'+randomUUID();
  const partial=request(new URL(root,base),{method:'POST',headers:{
    Origin:'http://127.0.0.1:5173',Cookie:admin.cookie,'x-csrf-token':admin.csrf,
    'x-depot-id':randomUUID(),'x-fichier-revision':'7',
    'Content-Type':'multipart/form-data; boundary='+boundary,'Content-Length':'200000',
  }});
  partial.on('error',()=>{});
  partial.write('--'+boundary+'\r\nContent-Disposition: form-data; name="fichier"; filename="interrompu.pdf"\r\nContent-Type: application/pdf\r\n\r\n');
  partial.write(Buffer.alloc(20000,65));
  await until(async()=> (await readdir(path.join(storageRoot,'temporaires'))).length>0);
  partial.destroy();
  await until(async()=> (await readdir(path.join(storageRoot,'temporaires'))).length===0);
  assert.equal((await versions()).revision,7);

  const orphan=randomUUID(), temp=randomUUID()+'.part';
  await writeFile(path.join(objects,orphan+'.blob'),'orphelin fictif');
  await writeFile(path.join(storageRoot,'temporaires',temp),'temporaire fictif');
  const oldTime=new Date(Date.now()-2*86400000);
  await utimes(path.join(objects,orphan+'.blob'),oldTime,oldTime);
  await utimes(path.join(storageRoot,'temporaires',temp),oldTime,oldTime);
  const report=await store.audit(prisma,{cleanTemporary:true});
  assert(report.orphelins.includes(orphan));assert.equal(report.temporairesNettoyes,1);
  assert(await readFile(path.join(objects,orphan+'.blob')));
  await unlink(path.join(objects,orphan+'.blob'));
  const row=await prisma.pieceJointe.findUnique({where:{id:first.id}});
  const actual=path.join(objects,row.stockageKey+'.blob');
  await rename(actual,actual+'.offline');
  try{
    assert.equal((await admin.request(root+'/'+first.id+'/telecharger')).status,503);
    assert((await store.audit(prisma,{ageMs:0})).manquants.includes(first.id));
  }finally{await rename(actual+'.offline',actual);}
  const originalBytes=await readFile(actual);
  const alteredBytes=Buffer.from(originalBytes);alteredBytes[alteredBytes.length-1]^=1;
  await writeFile(actual,alteredBytes);
  try{assert((await store.audit(prisma,{ageMs:0})).alteres.includes(first.id));}
  finally{await writeFile(actual,originalBytes);}
  const finalReport=await store.audit(prisma,{ageMs:0});
  assert.deepEqual(finalReport.orphelins,[]);assert.deepEqual(finalReport.manquants,[]);
  assert.deepEqual(finalReport.alteres,[]);
  for(const endpoint of['/api/formations','/api/catalogue/formations','/api/formations/pieces-jointes-essai']){
    const result=await anon.request(endpoint);assert.equal(result.status,200);const text=await result.text();
    for(const secret of['fichiers@example.invalid','stockageKey','empreinte','programme.pdf','PieceJointe'])assert(!text.includes(secret));
  }
  assert.equal((await anon.request('/.private-documents/objets/'+row.stockageKey+'.blob')).status,404);
  await restart({documentStorage:{root:storageRoot,maxFileBytes:128}});
  assert.equal((await upload({revision:7})).status,413);
  assert.equal((await versions()).limiteOctets,128);
  await restart({});
  await mkdir(path.join(run,'browser-files'),{recursive:true});
  await writeFile(path.join(run,'browser-files','document-test.pdf'),pdf);
  await writeFile(path.join(run,'browser-files','image-test.png'),png);
  pass('fichiers : interruption nettoyée, audit orphelins sans suppression, temporaires anciens nettoyés, manquants détectés et confidentialité');
}
