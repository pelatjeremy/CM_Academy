import {Router} from 'express';
import {randomUUID,createHash} from 'node:crypto';
import {organismeSchema,organismeSelect,emissionSchema,emissionSelect,preparerAttestation,hashDonnees,modeleVersion,erreurAttestation as erreur,routeAttestation as route} from '../lib/attestations.js';
import {genererAttestation} from '../lib/attestation-pdf.js';
import {telechargerDocument} from '../lib/telechargement.js';
import {normaliserConflitTransaction} from '../lib/preinscriptions.js';
export function adminAttestations(prisma,storage,generate=genererAttestation,clock=()=>new Date()){
 const router=Router(),base='/inscriptions/:id/dossier/attestations';
 router.get('/organisme-attestation',route(async(req,res)=>res.json({item:await prisma.organismeAttestation.findUnique({where:{id:'principal'},select:organismeSelect})})));
 router.put('/organisme-attestation',route(async(req,res)=>{
  const parsed=organismeSchema.safeParse(req.body);
  if(!parsed.success)throw erreur(422,'Vérifiez les informations de l’organisme.',Object.fromEntries(parsed.error.issues.map(i=>[i.path.join('.'),i.message])));
  const {revision,...data}=parsed.data;
  const item=await prisma.$transaction(async tx=>{
   const current=await tx.organismeAttestation.findUnique({where:{id:'principal'},select:{revision:true}});
   if((current?.revision||0)!==revision)throw erreur(409,'La configuration a changé. Votre saisie est conservée. Rechargez-la.');
   return current?tx.organismeAttestation.update({where:{id:'principal',revision},data:{...data,revision:revision+1,modifieParId:req.user.id},select:organismeSelect}):tx.organismeAttestation.create({data:{...data,modifieParId:req.user.id},select:organismeSelect});
  },{isolationLevel:'Serializable'});
  res.json({item,message:'Informations de l’organisme enregistrées.'});
 }));
 router.get(base,route(async(req,res)=>{
  const prepared=await prisma.$transaction(tx=>preparerAttestation(tx,req.params.id,clock()),{isolationLevel:'RepeatableRead'});
  const versions=await prisma.attestationEmission.findMany({where:{inscriptionId:req.params.id},select:emissionSelect,orderBy:{numero:'desc'}});
  res.json({versions,fields:prepared.fields});
 }));
 router.post(base+'/apercu',route(async(req,res)=>{
  if(!req.body||Object.keys(req.body).length)throw erreur(422,'Aucun champ supplémentaire n’est accepté.');
  const p=await prisma.$transaction(tx=>preparerAttestation(tx,req.params.id,clock()),{isolationLevel:'RepeatableRead'});
  const pdf=await generate(p.donnees,{brouillon:true,fields:p.fields});
  res.set('Cache-Control','no-store').json({pdf:pdf.toString('base64'),empreinte:p.empreinte,couranteId:p.couranteId,fields:p.fields});
 }));
 router.get(base+'/:emissionId/telecharger',route(async(req,res)=>{
  const row=await prisma.attestationEmission.findFirst({where:{id:req.params.emissionId,inscriptionId:req.params.id},select:{pieceJointe:{select:{stockageKey:true,stockageClassement:true,taille:true,typeMime:true,nomOriginal:true}}}});
  if(!row)throw erreur(404,'Attestation introuvable.');
  return telechargerDocument(storage,row.pieceJointe,res);
 }));
 router.post(base+'/emettre',route(async(req,res)=>{
  const parsed=emissionSchema.safeParse(req.body);
  if(!parsed.success)throw erreur(422,'Actualisez l’aperçu et confirmez l’émission.',Object.fromEntries(parsed.error.issues.map(i=>[i.path.join('.'),i.message])));
  const data=parsed.data,empreinteRequete=hashDonnees({inscriptionId:req.params.id,auteurId:req.user.id,...data});
  let stockageKey;
  try{
   const result=await prisma.$transaction(async tx=>{
    // Le rejeu exact réussit même si les sources ont changé après le commit.
    const existing=await tx.attestationEmission.findUnique({where:{requeteId:data.requeteId},select:{...emissionSelect,empreinteRequete:true}});
    if(existing){if(existing.empreinteRequete!==empreinteRequete)throw erreur(409,'Cette demande d’émission a déjà été utilisée.');const {empreinteRequete:_,...item}=existing;return {item,replay:true};}
    const p=await preparerAttestation(tx,req.params.id,clock());
    if(p.empreinte!==data.empreinte||p.couranteId!==data.couranteId)throw erreur(409,'Les données ont changé depuis l’aperçu. Vos saisies sont conservées. Générez un nouvel aperçu.');
    if(Object.keys(p.fields).length)throw erreur(422,'L’attestation ne peut pas encore être émise.',p.fields);
    if(p.couranteId&&!data.motif)throw erreur(422,'Un motif est obligatoire pour corriger une attestation.',{motif:'Expliquez la correction.'});
    const date=clock(),reference='ATT-'+date.getUTCFullYear()+'-'+randomUUID();
    const pdf=await generate(p.donnees,{reference,dateEmission:date});
    stockageKey=randomUUID();await storage.storeGenerated(pdf,stockageKey);
    const key={inscriptionId:req.params.id,categorie:'ATTESTATION'};
    const element=await tx.elementDocumentaire.upsert({where:{inscriptionId_categorie:key},create:key,update:{}});
    const advanced=await tx.elementDocumentaire.updateMany({where:{...key,fichierRevision:element.fichierRevision},data:{fichierRevision:{increment:1}}});
    if(advanced.count!==1)throw erreur(409,'Une pièce a été ajoutée ailleurs. Actualisez l’aperçu.');
    const piece=await tx.pieceJointe.create({data:{...key,version:element.fichierRevision+1,depotId:data.requeteId,stockageKey,nomOriginal:reference+'.pdf',taille:pdf.length,typeMime:'application/pdf',empreinte:createHash('sha256').update(pdf).digest('hex'),auteurId:req.user.id,date}});
    if(p.couranteId)await tx.attestationEmission.update({where:{id:p.couranteId},data:{courante:false}});
    const item=await tx.attestationEmission.create({data:{inscriptionId:req.params.id,pieceJointeId:piece.id,requeteId:data.requeteId,empreinteRequete,reference,numero:p.numero,modeleVersion,donnees:p.donnees,motif:data.motif,auteurId:req.user.id,date},select:emissionSelect});
    return {item,replay:false};
   },{isolationLevel:'Serializable',timeout:30000,maxWait:10000});
   res.status(result.replay?200:201).json(result);
  }catch(error){
   error=normaliserConflitTransaction(error);
   if(error.attestationError||['P2002','P2034'].includes(error.code))throw error;
   throw erreur(503,'L’émission n’a pas pu être confirmée. Réessayez avec la même demande ; aucune version incomplète ne sera présentée.');
  }finally{
   if(stockageKey)try{if(!await prisma.pieceJointe.findUnique({where:{stockageKey},select:{id:true}}))await storage.discardObject(stockageKey);}catch{/* Audit sans suppression en cas de commit incertain. */}
  }
 }));
 return router;
}
