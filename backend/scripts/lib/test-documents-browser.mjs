import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import path from 'node:path';
import {chromium,expect} from '@playwright/test';
export async function testDocumentsBrowser({origin,run,adminEmail,adminPassword,pass,prisma}){
 const f=JSON.parse(readFileSync(path.join(run,'documents-browser.json'),'utf8'));
 const executablePath=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
 const browser=await chromium.launch({...(executablePath?{executablePath}:{}),headless:true});
 const ac=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']}),sc=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const admin=await ac.newPage(),student=await sc.newPage(),errors=[];for(const p of [admin,student])p.on('pageerror',()=>errors.push('Erreur JavaScript'));
 const adminPath='/admin/suivi-documents/'+f.inscriptionId,studentPath='/stagiaire/inscriptions/'+f.inscriptionId+'/documents';
 async function credentials(page,email,password){await page.getByLabel('Adresse email').fill(email);await page.getByLabel('Mot de passe',{exact:true}).fill(password);await page.getByRole('button',{name:'Se connecter',exact:true}).press('Enter');}
 let phase='connexion admin';
 try{
  await admin.goto(origin+adminPath);await admin.waitForURL('**/admin/connexion?retour=*');await credentials(admin,adminEmail,adminPassword);await admin.waitForURL(origin+adminPath);
  phase='chargement détail admin';await admin.getByRole('heading',{name:'Contrat signé',exact:true}).waitFor();
  const section=admin.getByRole('heading',{name:'Contrat signé',exact:true}).locator('..');
  phase='configuration admin';await section.getByText('Configurer cette pièce pour l’inscription',{exact:true}).click();await section.getByLabel('Obligatoire pour la complétude').check();await section.getByRole('button',{name:'Enregistrer la configuration',exact:true}).press('Enter');await section.getByText('Configuration enregistrée.',{exact:true}).waitFor();
  phase='correction admin';await section.getByLabel('Motif visible par le stagiaire').fill('Merci de signer toutes les pages.');await section.getByRole('button',{name:'Demander une correction',exact:true}).press('Enter');await section.getByText('Décision enregistrée.',{exact:true}).waitFor();
  phase='copie lien';await admin.getByRole('button',{name:'Copier le lien stagiaire',exact:true}).click();assert.equal(await admin.evaluate(()=>navigator.clipboard.readText()),origin+studentPath);
  phase='filtres tableau';await admin.goto(origin+'/admin/suivi-documents');await admin.getByRole('heading',{name:'Suivi des documents',exact:true}).waitFor();await admin.getByLabel('Formation',{exact:true}).selectOption(f.formationId);await admin.getByLabel('Rechercher un stagiaire').fill('Alice');await admin.getByLabel('État du dossier').selectOption('aCorriger');await expect(admin.locator('tbody tr')).toHaveCount(1);await admin.getByRole('link',{name:'Ouvrir les documents de Essai Alice fictive',exact:true}).waitFor();
  await admin.screenshot({path:path.join(run,'documents-admin-tableau.png'),fullPage:true});
  pass('navigateur ADMIN : lien profond après connexion, configuration individuelle au clavier, demande de correction, copie du lien et filtres du tableau');
  phase='connexion stagiaire';await student.goto(origin+studentPath);await student.waitForURL('**/stagiaire/connexion?retour=*');await credentials(student,f.email,f.password);await student.waitForURL(origin+studentPath);await student.getByRole('heading',{name:'Contrat signé',exact:true}).waitFor();await student.getByText('Merci de signer toutes les pages.',{exact:true}).first().waitFor();
  assert(!(await student.locator('body').innerText()).includes('NOTE_INTERNE_NE_PAS_EXPOSER'));
  const pattern='**/dossier/elements/CONVENTION_CONTRAT/fichiers';
  await student.route(pattern,route=>route.request().method()==='POST'?route.abort('failed'):route.continue());
  phase='dépôt et erreur stagiaire';await student.getByLabel('Fichier à transmettre').setInputFiles({name:'contrat-browser.pdf',mimeType:'application/pdf',buffer:readFileSync(path.join(run,'contrat-fictif.pdf'))});
  await student.getByRole('button',{name:'Transmettre une nouvelle version',exact:true}).press('Enter');await student.getByRole('alert').waitFor();assert((await student.getByLabel('Fichier à transmettre').inputValue()).endsWith('contrat-browser.pdf'));
  await student.unroute(pattern);await student.getByRole('button',{name:'Transmettre une nouvelle version',exact:true}).press('Enter');await student.getByText('Dépôt confirmé. Votre pièce est à vérifier.',{exact:true}).waitFor();
  assert.equal(await student.getByLabel('Fichier à transmettre').inputValue(),'');assert(await student.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await student.screenshot({path:path.join(run,'documents-stagiaire-mobile.png'),fullPage:true});
  pass('navigateur STAGIAIRE 390 px : retour après connexion, motif visible, saisie fichier préservée après transfert échoué, reprise au clavier, nouvelle version à vérifier et aucun débordement');
  phase='validation finale';await admin.goto(origin+adminPath);await admin.getByRole('heading',{name:'Contrat signé',exact:true}).waitFor();await admin.getByRole('button',{name:/^Valider la version/}).press('Enter');await admin.getByText('Décision enregistrée.',{exact:true}).waitFor();await admin.getByText(/Dossier documentaire complet\./).waitFor();
  await student.reload();await student.getByRole('heading',{name:'Contrat signé',exact:true}).waitFor();assert((await student.locator('body').innerText()).includes('Validé'));await student.setViewportSize({width:1366,height:900});await student.screenshot({path:path.join(run,'documents-stagiaire-desktop.png'),fullPage:true});
  assert.equal((await prisma.elementDocumentaire.findUnique({where:{inscriptionId_categorie:{inscriptionId:f.inscriptionId,categorie:'CONVENTION_CONTRAT'}}})).suiviEtat,'VALIDE');assert.deepEqual(errors,[]);
  pass('navigateur ADMIN → STAGIAIRE → ADMIN : dépôt remplacé puis validé, complétude et historique visibles, bureau/mobile et aucune erreur JavaScript');
 }catch(error){console.error('Échec navigateur : '+phase+' ('+error.name+')');await admin.screenshot({path:path.join(run,'documents-echec-admin.png'),fullPage:true});await student.screenshot({path:path.join(run,'documents-echec-stagiaire.png'),fullPage:true});throw error;}finally{await browser.close();}
}
