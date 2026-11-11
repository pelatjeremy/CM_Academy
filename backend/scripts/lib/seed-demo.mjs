import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {copyFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';
import {hashPassword} from '../../auth/passwords.js';
import {createDocumentStorage,empreinteFichier} from '../../lib/documents.js';
import {validateMp4} from '../../lib/videos.js';
import {Temporal} from '@js-temporal/polyfill';

export const demoIds={formation:'demo-formation-v1',session:'demo-session-v1',inscription:'demo-inscription-alice',otherInscription:'demo-inscription-leo',lesson:'demo-lecon-observer',video:'demo-video-v1',pdf:'demo-programme-v1',questionnaire:'demo-questionnaire-v1'};
const categories=['ENTRETIEN_INITIAL','POSITIONNEMENT','CONVENTION_CONTRAT','REGLEMENT_INTERIEUR','PROGRAMME','EMARGEMENT','EVALUATIONS','SATISFACTION_CHAUD','SATISFACTION_FROID','ATTESTATION'];
export async function seedDemo({prisma,root,assets,passwords,now=new Date()}){
 const identity=await prisma.$queryRaw`SELECT current_database() AS name`;
 if(!/^cmh_academy_demo(?:_[a-z0-9]+)?$/.test(identity[0].name))throw new Error('Jeu de démonstration refusé hors de la base dédiée.');
 for(const password of Object.values(passwords))if(typeof password!=='string'||password.length<16||password.length>128)throw new Error('Secrets de démonstration manquants ou trop courts.');
 const existing=await prisma.formation.findUnique({where:{id:demoIds.formation}});
 if(existing){if(existing.slug!=='observer-le-cheval-demonstration')throw new Error('Identité de démonstration incohérente.');return {created:false,...demoIds};}
 if(await prisma.utilisateur.count()||await prisma.formation.count())throw new Error('Initialisation refusée : la base dédiée contient déjà des données non reconnues.');
 const hashes=await Promise.all([passwords.admin,passwords.student,passwords.other].map(hashPassword));
 const storage=createDocumentStorage({root}),staged=[];
 const duration=await validateMp4(assets.video);
 async function stage(filename){
  const key=randomUUID(),tmp=path.join(root,'temporaires',randomUUID()+'.part');await mkdir(path.dirname(tmp),{recursive:true,mode:0o700});await mkdir(path.join(root,'objets'),{recursive:true,mode:0o700});await copyFile(filename,tmp);
  const req={documentTemporary:tmp};try{await storage.promote(req,key);}finally{await storage.discardTemporary(req);}
  staged.push(key);return {stockageKey:key,depotId:randomUUID(),taille:(await stat(filename)).size,empreinte:await empreinteFichier(filename)};
 }
 try{
  const programme=await stage(assets.pdf),support=await stage(assets.pdf),video=await stage(assets.video);
  const day=Temporal.Instant.from(now.toISOString()).toZonedDateTimeISO('Europe/Paris').toPlainDate();
  const local=(offset,hour)=>new Date(day.add({days:offset}).toZonedDateTime({timeZone:'Europe/Paris',plainTime:Temporal.PlainTime.from(hour)}).epochMilliseconds);
  const seances=Array.from({length:4},(_,n)=>({id:'demo-seance-'+n,debut:local(n-6,'09:00'),fin:local(n-6,'12:30')}));
  await prisma.$transaction(async tx=>{
   for(const [index,role,email]of [[0,'ADMIN','administration@demo.invalid'],[1,'STAGIAIRE','alice@demo.invalid'],[2,'STAGIAIRE','leo@demo.invalid']])await tx.utilisateur.create({data:{id:['demo-admin','demo-alice','demo-leo'][index],email,role,motDePasseHash:hashes[index]}});
   await tx.organismeAttestation.create({data:{denomination:'CMH Démonstration — organisme fictif',adresse:'1 allée des Chevaux — adresse fictive',identifiant:'DEMONSTRATION — SANS VALEUR ADMINISTRATIVE',representant:'Camille Exemple — personne fictive',modifieParId:'demo-admin'}});
   await tx.pole.create({data:{id:'demo-pole',titre:'Bien-être du cheval',slug:'bien-etre-demonstration',description:'Comprendre, observer et accompagner le cheval.'}});
   await tx.formateur.create({data:{id:'demo-formateur',nom:'Élodie Exemple — personne fictive',biographie:'Intervenante fictive créée uniquement pour présenter le fonctionnement de CMH Academy.'}});
   await tx.formation.create({data:{id:demoIds.formation,titre:'Observer et accompagner le cheval',slug:'observer-le-cheval-demonstration',resume:'Une formation de démonstration pour découvrir tout le parcours, du catalogue à l’espace stagiaire.',description:'Apprendre à décrire les attitudes et préparer une observation respectueuse du cheval. Organisme, personnes et inscriptions entièrement fictifs.',objectifs:'Observer les attitudes.\nDécrire les besoins.\nPréparer une observation.\nConstruire une synthèse.',programme:'Quatre séances : observer, préparer, échanger et synthétiser.',publicVise:'Personnes souhaitant découvrir le parcours de formation.',prerequis:'Aucun prérequis pour cette démonstration.',dureeMinutes:840,format:'HYBRIDE',tarif:'0.00',devise:'EUR',financement:'Démonstration sans facturation ni demande de financement.',publiee:true,parcoursDocumentaire:true,poleId:'demo-pole',formateurs:{create:{formateurId:'demo-formateur'}}}});
   await tx.session.create({data:{id:demoIds.session,formationId:demoIds.formation,capacite:12,lieu:'Salle de démonstration — lieu fictif',visiblePubliquement:true,modalitesPratiques:'Quatre rendez-vous de 3 h 30, horaires en heure de Paris.',seances:{create:seances}}});
   await tx.session.create({data:{id:'demo-session-prochaine',formationId:demoIds.formation,capacite:12,lieu:'En ligne — session fictive',visiblePubliquement:true,modalitesPratiques:'Session à venir présentée pour illustrer le calendrier.',seances:{create:Array.from({length:4},(_,n)=>({debut:local(14+n,'09:00'),fin:local(14+n,'12:30')}))}}});
   for(const [id,prenom,utilisateurId,email]of [[demoIds.inscription,'Alice','demo-alice','alice@demo.invalid'],[demoIds.otherInscription,'Léo','demo-leo','leo@demo.invalid']]){
    await tx.inscription.create({data:{id,sessionId:demoIds.session,prenom,nom:'Démonstration',email,typeDemande:'PARTICULIER',statut:'CONFIRMEE',dossier:{create:{parcoursDocumentaire:true,elements:{create:categories.map(categorie=>({categorie,etat:'A_PREPARER'}))}}}}});
    const token=randomBytes(32).toString('base64url');const invitation=await tx.invitationStagiaire.create({data:{inscriptionId:id,email,empreinte:createHash('sha256').update(token).digest('hex'),expireAt:new Date(now.getTime()+86400000),utiliseeAt:now,utilisateurId,auteurId:'demo-admin'}});
    await tx.rattachementStagiaire.create({data:{inscriptionId:id,utilisateurId,invitationId:invitation.id}});
   }
   await tx.pieceJointe.create({data:{id:demoIds.pdf,inscriptionId:demoIds.inscription,categorie:'PROGRAMME',version:1,...programme,nomOriginal:'programme-demonstration.pdf',typeMime:'application/pdf',partageStagiaire:true,partageRevision:1,auteurId:'demo-admin'}});
   await tx.partagePieceJointe.create({data:{fichierId:demoIds.pdf,partage:true,auteurId:'demo-admin'}});
   await tx.parcoursPedagogique.create({data:{formationId:demoIds.formation}});
   for(const [ordre,id,titre]of [[0,'demo-module-observer','Observer le cheval'],[1,'demo-module-preparer','Préparer et synthétiser']])await tx.modulePedagogique.create({data:{id,formationId:demoIds.formation,titre,ordre,publie:true}});
   for(const [id,moduleId,ordre,titre,contenu]of [[demoIds.lesson,'demo-module-observer',0,'Observer les attitudes','Décrivez ce que vous observez, sans interprétation hâtive. Le support et la vidéo de démonstration sont disponibles ci-dessous.'],['demo-lecon-besoins','demo-module-observer',1,'Identifier les besoins','Repérez les besoins du cheval et préparez vos questions.'],['demo-lecon-synthese','demo-module-preparer',0,'Préparer une synthèse','Rédigez trois observations et une question à partager.']])await tx.leconPedagogique.create({data:{id,moduleId,ordre,titre,contenu,publie:true}});
   await tx.supportLecon.create({data:{id:'demo-support-pdf',leconId:demoIds.lesson,...support,nomOriginal:'support-observation.pdf',typeMime:'application/pdf',auteurId:'demo-admin'}});
   await tx.videoLecon.create({data:{id:demoIds.video,leconId:demoIds.lesson,version:1,...video,nomOriginal:'observation-demonstration.mp4',typeMime:'video/mp4',titre:'Vidéo de démonstration : observer et décrire',description:'Mire animée et son de synthèse créés pour cette présentation ; aucun contenu tiers.',transcription:'Pendant douze secondes, une mire de couleurs animée et un son de synthèse illustrent le lecteur. Cette vidéo ne valide aucune présence ni progression.',dureeSecondes:duration,auteurId:'demo-admin'}});
   await tx.progressionLecon.create({data:{inscriptionId:demoIds.inscription,leconId:'demo-lecon-besoins',terminee:true,termineeAt:now}});
   for(const [i,seance]of seances.entries())await tx.presence.create({data:{inscriptionId:demoIds.inscription,seanceId:seance.id,debut:seance.debut,fin:seance.fin,etat:i===3?'PARTIEL':'PRESENT',dureeSuivieMs:BigInt((i===3?90:210)*60000),modifieParId:'demo-admin'}});
   const questions=[{id:randomUUID(),type:'TEXTE_COURT',libelle:'Qu’aimeriez-vous observer chez le cheval ?',obligatoire:true,choix:[]}];
   await tx.modeleQuestionnaire.create({data:{id:'demo-modele-questionnaire',titre:'Préparer mon observation',categorie:'POSITIONNEMENT',questions,valide:true,revision:1,auteurId:'demo-admin',modifieParId:'demo-admin'}});
   await tx.questionnaireAttribue.create({data:{id:demoIds.questionnaire,inscriptionId:demoIds.inscription,modeleId:'demo-modele-questionnaire',modeleRevision:1,requeteId:randomUUID(),titre:'Préparer mon observation',categorie:'POSITIONNEMENT',questions,auteurId:'demo-admin'}});
  },{timeout:30000});
  return {created:true,...demoIds};
 }catch(error){
  for(const key of staged)try{if(!await prisma.pieceJointe.findUnique({where:{stockageKey:key}})&&!await prisma.supportLecon.findUnique({where:{stockageKey:key}})&&!await prisma.videoLecon.findUnique({where:{stockageKey:key}}))await storage.discardObject(key);}catch{/* Preserve an uncertain commit for the storage audit. */}
  throw error;
 }
}
