import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {chromium} from '@playwright/test';

export async function testVideosBrowser({origin,run,adminEmail,adminPassword,pass,prisma}) {
 const fixture=JSON.parse(readFileSync(path.join(run,'videos-browser.json'),'utf8'));
 const executablePath=process.env.CMH_BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
 const browser=await chromium.launch({...(executablePath?{executablePath}:{}),headless:true,args:['--autoplay-policy=user-gesture-required']});
 const adminContext=await browser.newContext({viewport:{width:1440,height:1000}}),studentContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const admin=await adminContext.newPage(),student=await studentContext.newPage();
 const errors=[],ranges=[];for(const page of [admin,student])page.on('pageerror',()=>errors.push('Erreur JavaScript navigateur'));
 student.on('response',response=>{if(response.url().includes('/videos/')&&response.url().endsWith('/lecture'))ranges.push({status:response.status(),range:response.request().headers().range||null});});
 async function login(page,role,email,password){await page.goto(origin+'/'+role+'/connexion');await page.getByLabel('Adresse email').fill(email);await page.getByLabel('Adresse email').press('Tab');await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).press('Enter');await page.waitForURL(origin+'/'+role);}
 const lessonPath='/stagiaire/inscriptions/'+fixture.inscriptionId+'/parcours/'+fixture.leconId;
 const adminPath='/admin/catalogue/formations/'+fixture.formationId+'/contenu';
 const before=await prisma.progressionLecon.findMany({where:{inscriptionId:fixture.inscriptionId},orderBy:{leconId:'asc'}});
 try {
  await login(admin,'admin',adminEmail,adminPassword);await admin.goto(origin+adminPath);
  await admin.getByRole('button',{name:'Modifier la leçon Préparer une observation',exact:true}).click();
  await admin.getByRole('heading',{name:'Vidéo ou replay MP4',exact:true}).waitFor();
  assert.match(await admin.locator('#video-format').innerText(),/512 Mio/);
  const count=await prisma.videoLecon.count({where:{leconId:fixture.leconId}});
  await admin.getByLabel('Titre de la vidéo (obligatoire)').fill('Replay de démonstration navigateur');
  await admin.getByLabel('Transcription textuelle (facultative)').fill('Transcription vérifiée au clavier : mire de couleurs et son de démonstration.');
  await admin.getByLabel('Choisir un fichier MP4').setInputFiles(fixture.filename);
  await admin.getByRole('button',{name:'Remplacer la vidéo',exact:true}).click();await admin.getByRole('dialog').getByRole('button',{name:'Annuler',exact:true}).press('Enter');
  assert.equal(await prisma.videoLecon.count({where:{leconId:fixture.leconId}}),count);
  await admin.getByRole('button',{name:'Remplacer la vidéo',exact:true}).click();await admin.getByRole('button',{name:'Confirmer le remplacement',exact:true}).press('Enter');
  await admin.getByText('Version vidéo enregistrée. Les anciennes versions restent dans l’historique privé.',{exact:true}).waitFor({timeout:120000});
  await admin.getByRole('link',{name:'Prévisualiser le parcours',exact:true}).click();await admin.getByRole('link',{name:'Préparer une observation',exact:true}).click();
  await admin.locator('video').waitFor();assert.equal(await admin.locator('video').getAttribute('autoplay'),null);
  await admin.screenshot({path:path.join(run,'videos-admin-preview.png'),fullPage:true});
  pass('navigateur ADMIN : remplacement MP4 réel, confirmation annulée puis validée, historique et prévisualisation pédagogique existante');
  await login(student,'stagiaire',fixture.email,fixture.password);await student.goto(origin+lessonPath);
  const video=student.locator('video');await video.waitFor();await student.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
  assert.equal(await video.evaluate(v=>v.paused),true);assert.equal(await video.getAttribute('autoplay'),null);assert.equal(await video.getAttribute('playsinline'),'');
  await video.focus();await video.press('Space');await student.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.paused&&v.currentTime>0.1;});
  await video.evaluate(v=>{v.currentTime=8;});await student.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.seeking&&v.currentTime>=7.5&&v.readyState>=2;});
  await video.press('Space');await student.waitForFunction(()=>document.querySelector('video')?.paused);
  await student.getByText('Transcription de la vidéo',{exact:true}).press('Enter');assert(await student.getByText('Transcription vérifiée au clavier : mire de couleurs et son de démonstration.',{exact:true}).isVisible());
  assert(await student.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert(ranges.some(r=>r.status===206&&r.range?.startsWith('bytes=')));
  assert.deepEqual(await prisma.progressionLecon.findMany({where:{inscriptionId:fixture.inscriptionId},orderBy:{leconId:'asc'}}),before);
  await student.screenshot({path:path.join(run,'videos-stagiaire-mobile.png'),fullPage:true});
  pass('navigateur STAGIAIRE 390 px : MP4 réellement décodé, lecture/pause au clavier, déplacement à 8 s, HTTP 206, transcription et absence de progression automatique');
  await student.setViewportSize({width:1366,height:900});await student.screenshot({path:path.join(run,'videos-stagiaire-desktop.png'),fullPage:true});
  await admin.goto(origin+adminPath);await admin.getByRole('button',{name:'Modifier la leçon Préparer une observation',exact:true}).click();
  await admin.getByRole('button',{name:'Retirer la vidéo',exact:true}).click();await admin.getByRole('button',{name:'Confirmer le retrait',exact:true}).press('Enter');
  await admin.getByText('Vidéo retirée du parcours. La version et son historique sont conservés.',{exact:true}).waitFor();
  const oldSrc=await video.getAttribute('src');const denied=await student.request.get(origin+oldSrc,{headers:{Range:'bytes=0-99'}});assert.equal(denied.status(),404);
  await student.reload();await student.getByText('Aucune vidéo disponible pour cette leçon.',{exact:true}).waitFor();
  // Add a new version from the empty state, through the same management form.
  await admin.getByLabel('Titre de la vidéo (obligatoire)').fill('Replay final de démonstration');await admin.getByLabel('Choisir un fichier MP4').setInputFiles(fixture.filename);
  await admin.getByRole('button',{name:'Ajouter la vidéo',exact:true}).click();await admin.getByRole('button',{name:'Confirmer l’ajout',exact:true}).press('Enter');
  await admin.getByText('Version vidéo enregistrée. Les anciennes versions restent dans l’historique privé.',{exact:true}).waitFor({timeout:120000});
  await student.reload();await student.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
  const active=await prisma.videoLecon.findFirst({where:{leconId:fixture.leconId,retireAt:null}});
  await prisma.utilisateur.update({where:{email:fixture.email},data:{actif:false}});
  const revoked=await student.request.head(origin+await student.locator('video').getAttribute('src'),{headers:{Range:'bytes=0-99'}});assert.equal(revoked.status(),401);
  await prisma.utilisateur.update({where:{email:fixture.email},data:{actif:true}});
  await login(student,'stagiaire',fixture.email,fixture.password);await student.goto(origin+lessonPath);
  // A storage fault is real, confined to this isolated object's file; restore immediately.
  const {rename}=await import('node:fs/promises');const object=path.join(run,'documents/objets',active.stockageKey+'.blob');
  await rename(object,object+'.unavailable');
  try{await student.reload();await student.getByText(/Lecture indisponible\. Vérifiez/).waitFor();}finally{await rename(object+'.unavailable',object);}
  await student.getByRole('button',{name:'Réessayer la lecture',exact:true}).click();await student.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
  assert.deepEqual(errors,[]);assert.deepEqual(await prisma.progressionLecon.findMany({where:{inscriptionId:fixture.inscriptionId},orderBy:{leconId:'asc'}}),before);
  pass('navigateur : retrait révoque les requêtes suivantes, état sans vidéo, ajout après retrait, compte désactivé, erreur stockage et reprise réelle, aucune erreur JavaScript');
  const configuredProbe=process.env.VIDEO_FFPROBE_PATH;
  try {
   process.env.VIDEO_FFPROBE_PATH=path.join(run,'ffprobe-absent.exe');
   await admin.goto(origin+adminPath);await admin.getByRole('button',{name:'Modifier la leçon Préparer une observation',exact:true}).click();
   await admin.getByText('La vérification des vidéos est indisponible. Contactez la personne chargée de l’hébergement (outil ffprobe).',{exact:true}).waitFor();
   await admin.getByLabel('Choisir un fichier MP4').setInputFiles(fixture.filename);
   assert(await admin.getByRole('button',{name:'Remplacer la vidéo',exact:true}).isDisabled());
  }finally{process.env.VIDEO_FFPROBE_PATH=configuredProbe;}
  pass('navigateur ADMIN : erreur ffprobe absent explicite et dépôt désactivé, lecture et données existantes conservées');
  writeFileSync(path.join(run,'videos-browser-results.json'),JSON.stringify({success:true,ranges,screenshots:['videos-admin-preview.png','videos-stagiaire-mobile.png','videos-stagiaire-desktop.png']},null,2));
 }finally{await browser.close();}
}
