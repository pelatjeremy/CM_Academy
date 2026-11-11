import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {readdir,writeFile,unlink,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import http from 'node:http';
import express from 'express';
import {ffprobePath} from 'ffmpeg-ffprobe-static';
import path from 'node:path';
import {createDocumentStorage} from '../../lib/documents.js';
import {createVideoStorage,validateMp4,streamVideo,videoProbeStatus,videoProbeError} from '../../lib/videos.js';
import {videoFixture} from './video-fixture.mjs';

async function boundedStreaming(run) {
 const filename=path.join(run,'large-stream-fixture.bin'),file=await open(filename,'w');await file.truncate(128*1024*1024);await file.close();
 let opened=0,closed=0,maxChunk=0,lastOptions;
 const storage={async openObject(){opened++;const handle=await open(filename,'r');return {stat:()=>handle.stat(),async close(){await handle.close();closed++;},createReadStream(options){lastOptions=options;const stream=handle.createReadStream(options);stream.on('data',b=>{maxChunk=Math.max(maxChunk,b.length);});stream.on('close',()=>closed++);return stream;}};}};
 const app=express();app.use((req,res)=>{streamVideo(storage,{taille:128*1024*1024,empreinte:'a'.repeat(64)},req,res).catch(()=>res.destroy());});
 const server=http.createServer(app);
 server.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 try {
  const head=await fetch(base,{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  const response=await fetch(base,{headers:{range:'bytes=100000000-100000010'}});assert.equal((await response.arrayBuffer()).byteLength,11);assert.deepEqual(lastOptions,{start:100000000,end:100000010,highWaterMark:65536});
  const controller=new AbortController();const download=await fetch(base,{signal:controller.signal});const reader=download.body.getReader();await reader.read();controller.abort();await reader.cancel().catch(()=>{});
  for(let n=0;n<100&&closed<opened;n++)await new Promise(r=>setTimeout(r,20));
  assert.equal(closed,opened);assert(maxChunk<=65536);assert(maxChunk>0);
 }finally{server.closeAllConnections();await new Promise(r=>server.close(r));await unlink(filename);}
}

export async function testVideos({prisma,client,pass,run,fixture,restart,getBase}) {
 // Only this isolated synthetic fixture runner uses the development binary.
 process.env.VIDEO_FFPROBE_PATH=ffprobePath;
 const info=JSON.parse(readFileSync(path.join(run,'elearning-browser.json'),'utf8'));
 const admin=client(),alice=client(),bob=client(),anon=client(),member=client();
 await admin.login();await alice.login(info.email,info.password);await bob.login('bob@stagiaire-test.invalid',info.password);await member.login('member@auth-test.invalid');
 const root='/api/admin/formations/'+info.formationId+'/contenu',lessonId=info.secondeLeconId,files=root+'/lecons/'+lessonId+'/videos';
 const student='/api/stagiaire/inscriptions/'+info.inscriptionId+'/parcours/lecons/'+lessonId;
 const otherStudent='/api/stagiaire/inscriptions/'+info.autreInscriptionId+'/parcours/lecons/'+lessonId;
 const filename=videoFixture(run),bytes=readFileSync(filename),badCodec=readFileSync(videoFixture(run,{codec:'mpeg4',name:'codec-incompatible.mp4'})),noFaststart=readFileSync(videoFixture(run,{faststart:false,name:'sans-faststart.mp4'}));
 const metadata={titre:'Vidéo privée — observer le cheval',description:'Replay synthétique isolé de douze secondes.',transcription:'Transcription fictive : mire de couleurs et signal sonore. Aucun stagiaire réel.'};
 const getTree=async()=>{const r=await admin.request(root);assert.equal(r.status,200);return r.json();};
 let revision=(await getTree()).revision;
 const write=async(c,url,body)=>{await c.token();return c.request(url,{method:'POST',headers:{'Content-Type':'application/json','x-csrf-token':c.csrf},body:JSON.stringify(body)});};
 async function upload({c=admin,data=bytes,name='video.mp4',type='video/mp4',depotId=randomUUID(),rev=revision,meta=metadata,expected=201,url=files,csrf=true}={}) {
  const form=new FormData();form.append('fichier',new Blob([data],{type}),name);for(const [k,v]of Object.entries(meta))form.append(k,v);
  if(csrf)await c.token();
  const r=await c.request(url,{method:'POST',headers:{...(csrf?{'x-csrf-token':c.csrf}:{}),'x-depot-id':depotId,'x-parcours-revision':String(rev)},body:form});
  if(Array.isArray(expected))assert(expected.includes(r.status));else assert.equal(r.status,expected);const body=await r.json();body.status=r.status;if(r.ok)revision=body.revision;return body;
 }
 const storage=createDocumentStorage({root:path.join(run,'documents')});
 const baseline={progressions:await prisma.progressionLecon.findMany({orderBy:[{inscriptionId:'asc'},{leconId:'asc'}]}),presences:await prisma.presence.count(),attestations:await prisma.attestationEmission.count()};
 assert.equal((await getTree()).videoMaxFileBytes,536870912);
 for(const [c,expected]of [[anon,401],[alice,403],[member,403]])await upload({c,expected});
 await upload({csrf:false,expected:403});await upload({data:Buffer.from('not a video'),expected:422});await upload({name:'video.txt',expected:422});await upload({type:'application/pdf',expected:422});await upload({data:Buffer.alloc(0),expected:422});
 await upload({data:bytes.subarray(0,bytes.length-100),expected:422});await upload({data:badCodec,expected:422});await upload({data:noFaststart,expected:422});await upload({meta:{...metadata,titre:''},expected:422});await upload({meta:{...metadata,transcription:'x'.repeat(30001)},expected:422});
 const configuredProbe=process.env.VIDEO_FFPROBE_PATH;
 try {
  process.env.VIDEO_FFPROBE_PATH=path.join(run,'ffprobe-absent.exe');
  assert.deepEqual(await videoProbeStatus(),{available:false,error:videoProbeError});
  assert.deepEqual((await getTree()).videoProbe,{available:false,error:videoProbeError});
  const failed=await upload({expected:503});assert.equal(failed.error,videoProbeError);
  assert.equal(await prisma.videoLecon.count(),0);
 }finally{process.env.VIDEO_FFPROBE_PATH=configuredProbe;}
 assert((await videoProbeStatus()).available);
 pass('vidéos : ffprobe absent signalé explicitement dans API ADMIN et dépôt 503 sans version créée ; configuration valide détectée');
 await restart({videoStorage:{maxFileBytes:bytes.length-1}});await admin.login();await upload({expected:413});
 await restart({videoStorage:{maxFileBytes:bytes.length}});await admin.login();
 const depotId=randomUUID(),first=await upload({depotId}),v1=first.item;
 const replay=await upload({depotId,rev:revision-1,expected:200});assert.equal(replay.item.id,v1.id);assert.equal(await prisma.videoLecon.count(),1);
 await upload({depotId,meta:{...metadata,titre:'Clé réutilisée'},expected:409});
 await restart();await admin.login();
 pass('vidéos : ADMIN/CSRF, extension/MIME/conteneur/codec/faststart, fichier vide/tronqué, métadonnées, limite exacte et rejeu idempotent');
 const url=id=>student+'/videos/'+id+'/lecture',adminUrl=id=>files+'/'+id+'/lecture';
 async function read(c,target,headers={},method='GET',status=200){const r=await c.request(target,{method,headers});if(r.status!==status)console.error('Lecture vidéo : méthode '+method+', plage '+(headers.range||'aucune')+', statut attendu '+status+', reçu '+r.status);assert.equal(r.status,status);return {r,bytes:Buffer.from(await r.arrayBuffer())};}
 let response=await read(alice,url(v1.id));assert.deepEqual(response.bytes,bytes);assert.equal(response.r.headers.get('content-type'),'video/mp4');assert.equal(response.r.headers.get('cache-control'),'private, no-store');assert.equal(response.r.headers.get('accept-ranges'),'bytes');assert.equal(response.r.headers.get('x-content-type-options'),'nosniff');assert.equal(response.r.headers.get('cross-origin-resource-policy'),'same-origin');
 assert.equal(response.r.headers.get('content-disposition'),null);
 const etag=response.r.headers.get('etag');
 for(const [range,start,end]of [['bytes=0-99',0,99],['bytes=100-',100,bytes.length-1],['bytes=-37',bytes.length-37,bytes.length-1],['bytes=10-999999999',10,bytes.length-1],['bytes=-999999999',0,bytes.length-1]]) {
  const {r,bytes:part}=await read(alice,url(v1.id),{range},'GET',206);assert.deepEqual(part,bytes.subarray(start,end+1));assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/${bytes.length}`);assert.equal(Number(r.headers.get('content-length')),end-start+1);
 }
 for(const range of ['bytes='+bytes.length+'-','bytes=-0']){const {r}=await read(alice,url(v1.id),{range},'GET',416);assert.equal(r.headers.get('content-range'),'bytes */'+bytes.length);}
 for(const range of ['bytes=99-1','bytes=oops','items=0-2','bytes=0-1,4-5','bytes=999999999999999999999999-'])assert.deepEqual((await read(alice,url(v1.id),{range})).bytes,bytes);
 response=await read(alice,url(v1.id),{range:'bytes=0-9'},'HEAD');assert.equal(response.bytes.length,0);assert.equal(Number(response.r.headers.get('content-length')),bytes.length);assert.equal(response.r.headers.get('content-range'),null);
 assert.deepEqual((await read(alice,url(v1.id),{range:'bytes=0-9','if-range':'"old"'})).bytes,bytes);assert.equal((await read(alice,url(v1.id),{range:'bytes=0-9','if-range':etag},'GET',206)).bytes.length,10);
 await boundedStreaming(run);
 pass('vidéos : octets MP4 réels, GET/HEAD, plages fermées/ouvertes/suffixes, 416, plages invalides ignorées, If-Range et blocs <=64 Kio ; interruption de lecture ferme le descripteur');
 for(const [c,status]of [[anon,401],[bob,404],[member,403],[admin,403]])for(const method of ['GET','HEAD'])await read(c,url(v1.id),{range:'bytes=0-9'},method,status);
 await read(alice,otherStudent+'/videos/'+v1.id+'/lecture',{range:'bytes=0-9'},'GET',404);
 await read(admin,adminUrl(v1.id),{range:'bytes=0-9'},'GET',206);
 await read(alice,student+'/videos/inconnu/lecture',{range:'bytes=0-9'},'GET',404);
 const foreign=await prisma.formation.create({data:{titre:'Autre formation vidéo isolée'}});
 await upload({url:'/api/admin/formations/'+foreign.id+'/contenu/lecons/'+lessonId+'/videos',expected:404});
 const account=await prisma.utilisateur.findUnique({where:{email:info.email}});
 await prisma.utilisateur.update({where:{id:account.id},data:{actif:false}});await read(alice,url(v1.id),{range:'bytes=0-9'},'HEAD',401);await prisma.utilisateur.update({where:{id:account.id},data:{actif:true}});await alice.login(info.email,info.password);
 await prisma.inscription.update({where:{id:info.inscriptionId},data:{statut:'ANNULEE'}});await read(alice,url(v1.id),{range:'bytes=0-9'},'GET',404);await prisma.inscription.update({where:{id:info.inscriptionId},data:{statut:'CONFIRMEE'}});
 for(const delegate of ['leconPedagogique','modulePedagogique']) {
  const where={id:delegate==='leconPedagogique'?lessonId:info.moduleId};await prisma[delegate].update({where,data:{publie:false}});await read(alice,url(v1.id),{range:'bytes=0-9'},'GET',404);await prisma[delegate].update({where,data:{publie:true}});
 }
 const lesson=(await(await alice.request(student)).json()).item;assert.equal(lesson.videos.length,1);for(const field of ['stockageKey','empreinte','auteur','nomOriginal'])assert(!JSON.stringify(lesson.videos).includes(field));
 for(const publicUrl of ['/api/catalogue/formations','/api/formations/parcours-pedagogique-isole','/api/formations']){const body=await(await anon.request(publicUrl)).text();for(const value of [metadata.titre,metadata.transcription,'stockageKey','VideoLecon'])assert(!body.includes(value));}
 pass('vidéos : isolation des inscriptions et formations, rôles, annulation, compte désactivé et dépublication revérifiés sur GET/HEAD/Range ; aucun contenu public');
 const objectsBefore=await readdir(path.join(run,'documents/objets')),countBefore=await prisma.videoLecon.count();
 await admin.token();
 await new Promise((resolve,reject)=>{
  const boundary='isolated-'+randomUUID();const prefix=Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="fichier"; filename="interrompu.mp4"\r\nContent-Type: video/mp4\r\n\r\n`);
  const request=http.request(getBase()+files,{method:'POST',headers:{Origin:'http://127.0.0.1:5173',Cookie:admin.cookie,'x-csrf-token':admin.csrf,'x-depot-id':randomUUID(),'x-parcours-revision':String(revision),'Content-Type':'multipart/form-data; boundary='+boundary,'Content-Length':bytes.length+prefix.length+1000}});
  request.on('error',e=>e.code==='ECONNRESET'?resolve():reject(e));request.on('response',res=>{res.resume();reject(new Error('Unexpected completed upload'));});
  request.write(prefix);request.write(bytes.subarray(0,65536));setTimeout(()=>{request.destroy();resolve();},150);
 });
 for(let n=0;n<100&&(await readdir(path.join(run,'documents/temporaires'))).length;n++)await new Promise(r=>setTimeout(r,30));
 assert.deepEqual(await readdir(path.join(run,'documents/temporaires')),[]);assert.deepEqual(await readdir(path.join(run,'documents/objets')),objectsBefore);assert.equal(await prisma.videoLecon.count(),countBefore);
 const broken=path.join(run,'video-storage-unavailable');await writeFile(broken,'panne simulée');await restart({documentStorage:{root:broken}});await admin.login();await upload({expected:503});await restart();await admin.login();await unlink(broken);
 assert.deepEqual(await readdir(path.join(run,'documents/objets')),objectsBefore);
 pass('vidéos : dépôt interrompu et panne de stockage sans version, objet orphelin ou temporaire incomplet');
 const oldRevision=revision,second=await upload({meta:{...metadata,titre:'Replay remplacé'}}),v2=second.item;
 await read(alice,url(v1.id),{range:'bytes=0-9'},'GET',404);await read(alice,url(v2.id),{range:'bytes=0-9'},'GET',206);await read(admin,adminUrl(v1.id),{},'HEAD');
 const retired=await prisma.videoLecon.findUnique({where:{id:v1.id}});assert(retired.retireAt&&retired.retireParId);assert.equal(v2.version,2);
 await upload({rev:oldRevision,expected:409});
 const raceRev=revision,otherAdmin=client();await otherAdmin.login();
 const race=await Promise.all([upload({rev:raceRev,expected:[201,409]}),upload({c:otherAdmin,rev:raceRev,expected:[201,409]})]);assert.deepEqual(race.map(r=>r.status).sort(),[201,409]);
 revision=(await getTree()).revision;
 const active=await prisma.videoLecon.findFirst({where:{leconId:lessonId,retireAt:null}});assert(active);assert.equal(await prisma.videoLecon.count({where:{leconId:lessonId,retireAt:null}}),1);
 const withdraw=files+'/'+active.id+'/retrait';assert.equal((await write(alice,withdraw,{revision})).status,403);assert.equal((await write(admin,withdraw,{revision:revision-1})).status,409);
 const removed=await write(admin,withdraw,{revision});assert.equal(removed.status,200);revision=(await removed.json()).revision;
 await read(alice,url(active.id),{range:'bytes=0-9'},'GET',404);assert.equal((await write(admin,withdraw,{revision:revision-1})).status,200);
 await assert.rejects(()=>prisma.videoLecon.update({where:{id:active.id},data:{titre:'Mutation interdite'}}));
 await assert.rejects(()=>prisma.videoLecon.delete({where:{id:active.id}}));
 await assert.rejects(()=>fixture.sql(readFileSync(path.join('prisma/rollbacks/20261111180000_videos_pedagogiques.sql'),'utf8')),e=>e.code==='P0001');await fixture.rollback();
 pass('vidéos : remplacement conserve les versions et leur auteur, conflits concurrents, retrait idempotent et rollback protégé');
 const final=await upload();await restart();await admin.login();await read(alice,url(final.item.id),{range:'bytes=10-19'},'GET',206);
 assert.deepEqual({progressions:await prisma.progressionLecon.findMany({orderBy:[{inscriptionId:'asc'},{leconId:'asc'}]}),presences:await prisma.presence.count(),attestations:await prisma.attestationEmission.count()},baseline);
 assert.deepEqual(await storage.audit(prisma,{ageMs:0}),{temporaires:[],orphelins:[],manquants:[],alteres:[],inconnus:0,temporairesNettoyes:0});
 await assert.rejects(()=>validateMp4(filename,path.join(run,'ffprobe-absent.exe')),e=>e.pedagogie?.status===503);
 assert.throws(()=>createVideoStorage({maxFileBytes:2147483648}));
 writeFileSync(path.join(run,'videos-browser.json'),JSON.stringify({...info,leconId:lessonId,videoId:final.item.id,filename,metadata}),{mode:0o600});
 pass('vidéos : lecture après redémarrage, audit commun sans anomalie, progression déclarative/présences/attestations inchangées et configuration invalide refusée');
}
