// Read-only release verification on the existing fictitious demonstration.
// Credentials and reports stay in ignored directories. No seed or business writes.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium,expect} from '@playwright/test';
import {demoIds} from './lib/seed-demo.mjs';
import {indicateursDocumentaires,filtreDocumentaire} from '../../shared/document-dashboard.mjs';

const project=fileURLToPath(new URL('../../',import.meta.url));
const access=JSON.parse(fs.readFileSync(path.join(project,'.demo-secrets/access.json'),'utf8'));
const target=JSON.parse(fs.readFileSync(path.join(project,'deploy/railway-demo.json'),'utf8'));
const origin=new URL(access.origin).origin;assert.equal(origin,target.url);
const folder=path.join(project,'.demo-environment/dashboard-release');fs.mkdirSync(folder,{recursive:true});
const baselineFile=path.join(folder,'baseline.json'),baselineOnly=process.argv.includes('--baseline');
const digest=b=>createHash('sha256').update(b).digest('hex');
const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const browser=await chromium.launch({executablePath,headless:true});
const admin=await browser.newContext({viewport:{width:1680,height:1100}}),student=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),other=await browser.newContext(),anonymous=await browser.newContext();
const results=[],limits=[],errors=[];let phase='connexion';
const pass=t=>{results.push(t);console.log('PASS '+t);};
async function loginApi(context,account){const token=(await(await context.request.get(origin+'/api/auth/csrf')).json()).csrfToken;assert.equal((await context.request.post(origin+'/api/auth/connexion',{headers:{Origin:origin,'x-csrf-token':token},data:{email:account.email,password:account.password}})).status(),200);}
async function json(context,url){const r=await context.request.get(origin+url);assert.equal(r.status(),200);return r.json();}
async function snapshot(){
 const list=await json(admin,'/api/admin/suivi-documents'),details={},files=[];
 for(const {id}of list.items){const data=await json(admin,'/api/admin/inscriptions/'+id+'/documents');details[id]={items:data.items,completude:data.completude,limiteOctets:data.limiteOctets,modifiable:data.modifiable};for(const item of data.items)for(const file of item.fichiers){const url='/api/admin/inscriptions/'+id+'/dossier/elements/'+item.categorie+'/fichiers/'+file.id+'/telecharger',r=await admin.request.get(origin+url);assert.equal(r.status(),200);files.push({url,sha256:digest(await r.body())});}}
 const status=await json(admin,'/api/admin/demonstration/etat');assert.equal(status.migrations.terminees,15);assert(status.migrations.empreintesConformes);assert(Object.values(status.audit).every(n=>n===0));
 const progression=(await json(student,'/api/stagiaire/inscriptions/'+demoIds.inscription+'/parcours')).progression;
 return {status,details,files:files.sort((a,b)=>a.url.localeCompare(b.url)),progression};
}
try{
 await loginApi(admin,access.admin);await loginApi(student,access.student);await loginApi(other,access.other);
 const initial=await snapshot();
 if(baselineOnly){fs.writeFileSync(baselineFile,JSON.stringify(initial,null,2));pass('Référence distante : états, règles, versions, décisions, partages, empreintes des fichiers, volumes fonctionnels et 15 migrations conformes');}
 else{
  assert.deepEqual(initial,JSON.parse(fs.readFileSync(baselineFile,'utf8')));pass('Après déploiement : comptes et volumes fonctionnels identiques, règles/états/versions/partages inchangés, fichiers identiques par SHA256, 15 migrations et audit sans anomalie');
  const page=await admin.newPage();page.on('pageerror',()=>errors.push('Erreur JavaScript ADMIN'));
  // Exercise the actual login form in a new context, rather than a saved session.
  const loginContext=await browser.newContext(),loginPage=await loginContext.newPage();await loginPage.goto(origin+'/admin/connexion');await loginPage.getByLabel('Adresse email').fill(access.admin.email);await loginPage.getByLabel('Mot de passe',{exact:true}).fill(access.admin.password);await loginPage.getByRole('button',{name:'Se connecter',exact:true}).press('Enter');await loginPage.waitForURL(origin+'/admin');await loginContext.close();pass('Connexion ADMIN réelle au clavier');
  phase='tableau';const list=await json(admin,'/api/admin/suivi-documents'),metrics=indicateursDocumentaires(list.items),labels=[['Dossiers suivis',metrics.suivis],['Dossiers complets',metrics.complets],['Pièces à vérifier',metrics.aVerifier],['Dossiers avec pièces manquantes ou à corriger',metrics.aTraiter]];
  await page.goto(origin+'/admin/suivi-documents');await expect(page.locator('.document-table tbody tr')).toHaveCount(Math.min(10,list.items.length));
  for(const [label,count]of labels)await expect(page.getByRole('button',{name:new RegExp('^'+label)}).locator('strong')).toHaveText(String(count));
  assert.equal(await page.locator('.document-counts').getByText(/^0 /).count(),0);for(const time of await page.locator('.document-table time[datetime]').allTextContents())assert.match(time,/\d{2}:\d{2}/);
  for(const state of ['complet','incomplet','aVerifier','aCorriger','aTraiter','sansPieces']){await page.getByLabel('État du dossier',{exact:true}).selectOption(state);await expect(page.locator('.document-table tbody tr')).toHaveCount(Math.min(10,list.items.filter(i=>filtreDocumentaire(i,state)).length));}
  await page.getByRole('button',{name:'Réinitialiser les filtres',exact:true}).first().click();await page.getByLabel('Formation',{exact:true}).selectOption(demoIds.formation);await page.getByLabel('Session',{exact:true}).selectOption(demoIds.session);await page.getByLabel('Rechercher un stagiaire').fill('Alice');await expect(page.locator('.document-table tbody tr')).toHaveCount(1);
  const returnUrl=page.url();await page.getByRole('link',{name:/Voir le dossier de/}).click();await page.getByRole('heading',{level:1}).waitFor();await page.getByRole('link',{name:'← Retour au suivi des documents',exact:true}).press('Enter');await expect(page).toHaveURL(returnUrl);await expect(page.getByLabel('Rechercher un stagiaire')).toHaveValue('Alice');
  await page.getByRole('button',{name:'Réinitialiser les filtres',exact:true}).first().click();await page.getByLabel('Par page').selectOption('20');await expect(page.locator('.document-table tbody tr')).toHaveCount(Math.min(20,list.items.length));if(list.items.length<=10){assert(await page.getByRole('button',{name:'Suivant',exact:true}).isDisabled());limits.push('Deux inscriptions existantes : pagination vérifiée sur une seule page ; passage à une seconde page couvert en environnement isolé.');}
  await page.locator('h1').click();await page.screenshot({path:path.join(folder,'tableau-desktop.png'),fullPage:true});
  pass('Tableau réel : indicateurs exacts, filtres formation/session/état/recherche, pagination, retour avec filtres, zéros masqués et dates avec heure');
  const optionalAction=list.items.filter(i=>i.completude.total>0&&i.completude.complet&&(i.actions.aVerifier||i.actions.aCorriger));if(!optionalAction.length)limits.push('Aucun dossier existant ne cumule obligations validées et action facultative : combinaison vérifiée sur données isolées, sans ajouter ni modifier les données de démonstration.');
  phase='détail';await page.goto(origin+'/admin/suivi-documents/'+demoIds.inscription);await page.getByRole('heading',{name:/Documents à transmettre/}).waitFor();await page.getByRole('heading',{name:/Documents de l’organisme/}).waitFor();assert.equal(await page.locator('.document-piece-body[open]').count(),0);
  const detail=initial.details[demoIds.inscription];const requested=detail.items.filter(i=>i.demandee),order={A_VERIFIER:0,A_CORRIGER:1,A_TRANSMETTRE:2,VALIDE:3};
  for(const group of await page.locator('.document-origin-group').all()){const cats=await group.locator('.document-card').evaluateAll(nodes=>nodes.map(n=>n.id.slice(6)));const ranks=cats.map(c=>order[detail.items.find(i=>i.categorie===c).suiviEtat]);assert.deepEqual(ranks,[...ranks].sort((a,b)=>a-b));}
  for(const item of requested.filter(i=>i.suiviEtat==='A_CORRIGER')){const motif=item.suiviHistorique.filter(h=>h.type==='DECISION'&&h.version===item.fichierRevision&&h.etat==='A_CORRIGER').at(-1)?.motif;if(motif)assert(await page.locator('#piece-'+item.categorie).getByText(motif,{exact:true}).first().isVisible());}
  const pending=requested.find(i=>i.suiviEtat==='A_VERIFIER');assert(pending,'La démonstration doit conserver une pièce à vérifier');const piece=page.locator('#piece-'+pending.categorie);await piece.getByRole('button',{name:'Vérifier la pièce',exact:true}).press('Enter');await piece.getByLabel('Motif visible par le stagiaire').waitFor();assert(await piece.getByRole('button',{name:/Valider la version/}).isVisible());assert.equal(await piece.locator('.document-configuration').getAttribute('open'),null);assert.equal(await piece.locator('.document-history').getAttribute('open'),null);await piece.locator('.document-piece-body>summary').press('Enter');
  const fileLink=piece.getByRole('link',{name:'Consulter le document',exact:true});assert(await fileLink.isVisible());const [download]=await Promise.all([page.waitForEvent('download'),fileLink.click()]);assert.equal(await download.failure(),null);
  await page.locator('h1').click();await page.screenshot({path:path.join(folder,'dossier-desktop.png'),fullPage:true});await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(folder,'dossier-mobile.png'),fullPage:true});
  await page.goto(origin+'/admin/suivi-documents');await expect(page.locator('.document-table tbody tr')).toHaveCount(Math.min(10,list.items.length));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:'Navigation administrative',exact:true}).press('Enter');await page.getByRole('navigation',{name:'Administration',exact:true}).waitFor();await page.getByRole('button',{name:'Navigation administrative',exact:true}).press('Enter');await page.locator('h1').click();await page.screenshot({path:path.join(folder,'tableau-mobile.png'),fullPage:true});
  pass('Détail réel : origines séparées, ordre des états, motif visible, lignes repliées, consultation téléchargée et formulaire de vérification accessible ; ordinateur/mobile/clavier');
  phase='stagiaire et protection';const sp=await student.newPage();sp.on('pageerror',()=>errors.push('Erreur JavaScript STAGIAIRE'));await sp.goto(origin+'/stagiaire/inscriptions/'+demoIds.inscription+'/documents');await sp.getByRole('heading',{name:'Mes documents',exact:true}).waitFor();await sp.getByRole('heading',{name:'Documents fournis par l’organisme',exact:true}).waitFor();assert(await sp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const directContext=await browser.newContext(),direct=await directContext.newPage();const directPath='/stagiaire/inscriptions/'+demoIds.inscription+'/documents';await direct.goto(origin+directPath);await direct.waitForURL('**/stagiaire/connexion?retour=*');await direct.getByLabel('Adresse email').fill(access.student.email);await direct.getByLabel('Mot de passe',{exact:true}).fill(access.student.password);await direct.getByRole('button',{name:'Se connecter',exact:true}).press('Enter');await direct.waitForURL(origin+directPath);await directContext.close();
  const studentData=await json(student,'/api/stagiaire/inscriptions/'+demoIds.inscription+'/documents');for(const item of studentData.items)for(const file of item.fichiers){const url='/api/stagiaire/inscriptions/'+demoIds.inscription+'/dossier/elements/'+item.categorie+'/fichiers/'+file.id+'/telecharger',r=await student.request.get(origin+url);assert.equal(r.status(),200);assert(r.headers()['content-disposition'].startsWith('attachment;'));assert.equal((await anonymous.request.get(origin+url)).status(),401);assert.equal((await other.request.get(origin+url)).status(),404);}
  assert.equal((await anonymous.request.get(origin+'/api/admin/suivi-documents')).status(),401);assert.equal((await other.request.get(origin+'/api/admin/suivi-documents')).status(),403);assert.equal((await other.request.get(origin+'/api/stagiaire/inscriptions/'+demoIds.inscription+'/documents')).status(),404);
  await sp.screenshot({path:path.join(folder,'stagiaire-mobile.png'),fullPage:true});assert.deepEqual(await snapshot(),initial);assert.deepEqual(errors,[]);
  pass('Espace stagiaire, lien direct → connexion → retour, téléchargements protégés, refus anonyme et isolation entre deux stagiaires ; aucune modification documentaire pendant la recette');
  fs.writeFileSync(path.join(folder,'results.json'),JSON.stringify({success:true,origin,results,limits,status:initial.status},null,2));
 }
}catch(e){console.error('FAIL recette déployée : '+phase+' ('+e.name+')');fs.writeFileSync(path.join(folder,'error-private.json'),JSON.stringify({phase,message:e.message,stack:e.stack,results},null,2));process.exitCode=1;}finally{await browser.close();}
