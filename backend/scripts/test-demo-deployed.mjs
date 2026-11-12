import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
import {demoIds} from './lib/seed-demo.mjs';
const project=fileURLToPath(new URL('../../',import.meta.url)),privateFolder=path.join(project,'.demo-secrets'),reportFolder=path.join(project,'.demo-environment');
const access=JSON.parse(readFileSync(path.join(privateFolder,'access.json'),'utf8')),origin=new URL(access.origin).origin;
assert(origin.startsWith('https://'));
const after=process.argv.includes('--after-restart'),results=[],screenshots=[];
const scenarioPath=path.join(reportFolder,'documents-scenario.json'),expectedFiles=existsSync(scenarioPath)?JSON.parse(readFileSync(scenarioPath,'utf8')).fichiersReferences:3;
mkdirSync(reportFolder,{recursive:true});
const executablePath=process.env.CMH_BROWSER_PATH||['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const browser=await chromium.launch({...(executablePath?{executablePath}:{}),headless:true,args:['--autoplay-policy=user-gesture-required']});
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const root='/api/stagiaire/inscriptions/'+demoIds.inscription,video=root+'/parcours/lecons/'+demoIds.lesson+'/videos/'+demoIds.video+'/lecture',pdf=root+'/fichiers/'+demoIds.pdf+'/telecharger';
const pass=message=>{results.push(message);console.log('PASS '+message);};
const errors=[];
async function loginApi(request,account){const r=await request.get(origin+'/api/auth/csrf');const token=(await r.json()).csrfToken;const response=await request.post(origin+'/api/auth/connexion',{headers:{Origin:origin,'x-csrf-token':token},data:{email:account.email,password:account.password}});assert.equal(response.status(),200);}
try{
 const adminContext=await browser.newContext({viewport:{width:1440,height:1000},...(after?{storageState:path.join(privateFolder,'demo-admin-browser.json')}:{} )});
 const studentContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,...(after?{storageState:path.join(privateFolder,'demo-student-browser.json')}:{} )});
 const admin=await adminContext.newPage(),student=await studentContext.newPage();for(const page of [admin,student])page.on('pageerror',()=>errors.push('Erreur JavaScript navigateur'));
 if(after){
  const baseline=JSON.parse(readFileSync(path.join(reportFolder,'deployed-baseline.json'),'utf8'));
  assert.equal((await adminContext.request.get(origin+'/api/admin/moi')).status(),200);
  const state=await(await adminContext.request.get(origin+'/api/admin/demonstration/etat')).json();assert.equal(state.migrations.terminees,15);assert(state.migrations.empreintesConformes);assert.equal(state.fichiersReferences,expectedFiles);assert(Object.values(state.audit).every(n=>n===0));
  const progress=await(await studentContext.request.get(origin+root+'/parcours')).json();assert.deepEqual(progress.progression,baseline.progression);
  assert.equal(hash(await(await studentContext.request.get(origin+pdf)).body()),baseline.pdf);
  assert.equal(hash(await(await studentContext.request.get(origin+video)).body()),baseline.video);
  await student.goto(origin+'/stagiaire/inscriptions/'+demoIds.inscription+'/parcours/'+demoIds.lesson);await student.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
  pass('URL HTTPS après redémarrage : sessions authentifiées conservées, progression identique, PDF et vidéo identiques par SHA256, lecteur disponible');
  await student.getByRole('button',{name:'Se déconnecter',exact:true}).click();await student.waitForURL(origin+'/stagiaire/connexion');assert.equal((await studentContext.request.get(origin+video)).status(),401);
  await admin.goto(origin+'/admin');await admin.getByRole('button',{name:'Se déconnecter',exact:true}).click();await admin.waitForURL(origin+'/admin/connexion');assert.equal((await adminContext.request.get(origin+'/api/admin/moi')).status(),401);
  pass('déconnexions ADMIN et STAGIAIRE révoquant les accès après redémarrage');
 }else{
  await admin.goto(origin+'/formations');await admin.getByRole('link',{name:'Observer et accompagner le cheval',exact:true}).first().click();await admin.getByRole('heading',{name:'Observer et accompagner le cheval',exact:true}).waitFor();
  await admin.waitForFunction(()=>document.title==='Observer et accompagner le cheval — CMH Academy');assert.equal(await admin.getByRole('link',{name:'Nos formations',exact:true}).getAttribute('aria-current'),'page');
  const visible=await admin.locator('body').innerText();assert(visible.includes('Environnement de démonstration'));assert(visible.includes('09 h 00 – 12 h 30'));assert(!/UTC|\d{4}-\d{2}-\d{2}T/.test(visible));assert(visible.includes('14 h'));
  pass('catalogue et fiche HTTPS, mention de démonstration, onglet contextualisé, navigation active et horaires français sans ISO/UTC visibles');
  async function login(page,role,account){await page.goto(origin+'/'+role+'/connexion');await page.getByLabel('Adresse email').fill(account.email);await page.getByLabel('Mot de passe',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Se connecter',exact:true}).press('Enter');await page.waitForURL(origin+'/'+role);}
  await login(admin,'admin',access.admin);const cookies=await adminContext.cookies();assert(cookies.some(c=>c.name==='__Host-cmh.sid'&&c.secure&&c.httpOnly&&c.sameSite==='Lax'));
  const state=await(await adminContext.request.get(origin+'/api/admin/demonstration/etat')).json();assert.equal(state.migrations.terminees,15);assert(state.migrations.empreintesConformes);assert.equal(state.comptes,3);assert.equal(state.inscriptions,2);assert.equal(state.versionsVideo,1);assert.equal(state.fichiersReferences,expectedFiles);assert(Object.values(state.audit).every(n=>n===0));assert(state.ffprobe.available);
  await admin.goto(origin+'/admin/catalogue/sessions');await admin.getByRole('heading',{name:'Sessions',exact:true}).waitFor();await admin.getByRole('link',{name:'Modifier la session 1 de Observer et accompagner le cheval',exact:true}).waitFor();
  assert.match(await admin.title(),/Sessions.*CMH Academy/);assert.match(await admin.locator('body').innerText(),/14 h/);assert(!/UTC|\d{4}-\d{2}-\d{2}T/.test(await admin.locator('body').innerText()));
  await admin.goto(origin+'/admin/catalogue/formations/'+demoIds.formation+'/contenu');await admin.getByRole('button',{name:'Modifier la leçon Observer les attitudes',exact:true}).click();await admin.getByRole('heading',{name:'Vidéo ou replay MP4',exact:true}).waitFor();
  await admin.screenshot({path:path.join(reportFolder,'demo-administration.png'),fullPage:true});screenshots.push('demo-administration.png');
  pass('connexion ADMIN avec cookie Secure/HttpOnly/SameSite, sessions datées, gestion pédagogique et vidéo existante');
  await login(student,'stagiaire',access.student);await student.goto(origin+'/stagiaire/inscriptions/'+demoIds.inscription);await student.getByRole('heading',{name:'Présences',exact:true}).waitFor();
  const presence=await student.locator('dl.admin-dossier-summary').innerText();assert(presence.includes('14 h')&&presence.includes('12 h')&&presence.includes('Durée pédagogique'));
  const before=await(await studentContext.request.get(origin+root+'/parcours')).json();
  const ranges=[];student.on('response',r=>{if(r.url().endsWith('/lecture')&&r.request().headers().range)ranges.push(r.status());});
  await student.goto(origin+'/stagiaire/inscriptions/'+demoIds.inscription+'/parcours/'+demoIds.lesson);await student.waitForFunction(()=>document.querySelector('video')?.readyState>=1);
  assert.match(await student.title(),/Observer les attitudes.*CMH Academy/);const player=student.locator('video');assert(await player.evaluate(v=>v.paused));
  await player.focus();await player.press('Space');await student.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.paused&&v.currentTime>0.1;});
  await player.evaluate(v=>{v.currentTime=8;});await student.waitForFunction(()=>{const v=document.querySelector('video');return v&&!v.seeking&&v.currentTime>=7.5&&v.readyState>=2;});await player.press('Space');
  await student.getByText('Transcription de la vidéo',{exact:true}).press('Enter');assert(await student.getByText(/Pendant douze secondes/).isVisible());assert(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(ranges.includes(206));assert.deepEqual((await(await studentContext.request.get(origin+root+'/parcours')).json()).progression,before.progression);
  await student.screenshot({path:path.join(reportFolder,'demo-stagiaire-mobile.png'),fullPage:true});screenshots.push('demo-stagiaire-mobile.png');
  await student.setViewportSize({width:1366,height:900});await student.screenshot({path:path.join(reportFolder,'demo-stagiaire-ordinateur.png'),fullPage:true});screenshots.push('demo-stagiaire-ordinateur.png');
  pass('stagiaire : 14 h pédagogiques/programmées et 12 h renseignées distinguées, lecture MP4 réelle et déplacement à 8 s, clavier, transcription et mobile 390 px sans progression automatique');
  const otherContext=await browser.newContext(),anonymous=await browser.newContext();await loginApi(otherContext.request,access.other);
  for(const method of ['get','head']){assert.equal((await anonymous.request[method](origin+video,{headers:{Range:'bytes=0-99'}})).status(),401);assert.equal((await otherContext.request[method](origin+video,{headers:{Range:'bytes=0-99'}})).status(),404);}
  assert.equal((await anonymous.request.get(origin+pdf)).status(),401);assert.equal((await otherContext.request.get(origin+pdf)).status(),404);
  const doc=await studentContext.request.get(origin+pdf),movie=await studentContext.request.get(origin+video);assert.equal(doc.status(),200);assert.equal((await doc.body()).subarray(0,5).toString(),'%PDF-');assert.equal(movie.status(),200);
  const head=await studentContext.request.head(origin+video,{headers:{Range:'bytes=0-99'}});assert.equal(head.status(),200);assert.equal((await head.body()).length,0);
  const partial=await studentContext.request.get(origin+video,{headers:{Range:'bytes=100-109'}});assert.equal(partial.status(),206);assert.equal((await partial.body()).length,10);
  assert.equal((await studentContext.request.get(origin+video,{headers:{Range:'bytes=999999999-'}})).status(),416);
  const publicResponse=await anonymous.request.get(origin+'/api/formations/observer-le-cheval-demonstration');const publicText=await publicResponse.text();for(const value of ['stockageKey','motDePasseHash','transcription','alice@demo.invalid',access.admin.password])assert(!publicText.includes(value));
  pass('PDF privé, HEAD/Range/416 sur URL publique réelle, refus anonyme et autre stagiaire, API publique sans données privées');
  const progress=await(await studentContext.request.get(origin+root+'/parcours')).json();
  writeFileSync(path.join(reportFolder,'deployed-baseline.json'),JSON.stringify({origin,progression:progress.progression,pdf:hash(await doc.body()),video:hash(await movie.body())},null,2));
  await adminContext.storageState({path:path.join(privateFolder,'demo-admin-browser.json')});await studentContext.storageState({path:path.join(privateFolder,'demo-student-browser.json')});
  await otherContext.close();await anonymous.close();pass('progression existante conservée et empreintes préparées pour vérifier le redémarrage');
 }
 assert.deepEqual(errors,[]);writeFileSync(path.join(reportFolder,after?'deployed-after-restart-results.json':'deployed-results.json'),JSON.stringify({success:true,origin,results,screenshots},null,2));
}catch(error){process.exitCode=1;console.error('FAIL démonstration déployée : '+(error.code||error.name));writeFileSync(path.join(reportFolder,'deployed-error-private.json'),JSON.stringify({message:error.message,stack:error.stack,results},null,2));}
finally{await browser.close();}
