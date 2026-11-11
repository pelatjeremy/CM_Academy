import {Router} from 'express';
import {z} from 'zod';
import {inscriptionTransaction} from '../lib/preinscriptions.js';
import {modeleSchema,revisionSchema,parse,probleme,verifierQuestions,attributionSelect,dtoAttribution,routeQuestionnaire as route} from '../lib/questionnaires.js';
const auteurSelect={select:{email:true}};
const adminSelect={...attributionSelect,auteur:auteurSelect,retirePar:auteurSelect,soumisPar:auteurSelect};
export function adminQuestionnaires(prisma){
 const router=Router(),base='/questionnaires/modeles',dossiers='/inscriptions/:id/questionnaires';
 router.get(base,route(async(req,res)=>{
  const page=parse(z.coerce.number().int().min(1).max(100000),req.query.page||1);
  const q=parse(z.string().trim().max(160),req.query.q||'');
  if(req.query.valide!==undefined&&req.query.valide!=='true')throw probleme(422,'Filtre invalide.');
  const where={...(q?{titre:{contains:q,mode:'insensitive'}}:{}),...(req.query.valide==='true'?{valide:true}:{})};
  const [items,total]=await prisma.$transaction([prisma.modeleQuestionnaire.findMany({where,select:{id:true,titre:true,categorie:true,valide:true,revision:true,updatedAt:true},orderBy:[{titre:'asc'},{id:'asc'}],skip:(page-1)*20,take:20}),prisma.modeleQuestionnaire.count({where})]);
  res.json({items,total,page});
 }));
 router.get(base+'/:modeleId',route(async(req,res)=>{
  const item=await prisma.modeleQuestionnaire.findUnique({where:{id:req.params.modeleId},select:{id:true,titre:true,categorie:true,questions:true,valide:true,revision:true,createdAt:true,updatedAt:true,auteur:auteurSelect,modifiePar:auteurSelect}});
  if(!item)throw probleme(404,'Modèle introuvable.');res.json({item});
 }));
 router.post(base,route(async(req,res)=>{
  const data=parse(modeleSchema,req.body);verifierQuestions(data.questions);
  const item=await prisma.modeleQuestionnaire.create({data:{...data,auteurId:req.user.id,modifieParId:req.user.id},select:{id:true}});
  res.status(201).json({item});
 }));
 router.put(base+'/:modeleId',route(async(req,res)=>{
  const {revision,...data}=parse(modeleSchema.extend({revision:revisionSchema}),req.body);verifierQuestions(data.questions);
  const exists=await prisma.modeleQuestionnaire.findUnique({where:{id:req.params.modeleId},select:{id:true}});if(!exists)throw probleme(404,'Modèle introuvable.');
  const result=await prisma.modeleQuestionnaire.updateMany({where:{id:exists.id,revision},data:{...data,valide:false,revision:{increment:1},modifieParId:req.user.id}});
  if(!result.count)throw probleme(409,'Modèle modifié ailleurs. Vos saisies sont conservées.');res.json({message:'Brouillon enregistré.',revision:revision+1});
 }));
 router.post(base+'/:modeleId/valider',route(async(req,res)=>{
  const {revision}=parse(z.object({revision:revisionSchema}).strict(),req.body);
  await inscriptionTransaction(prisma,async tx=>{
   const item=await tx.modeleQuestionnaire.findUnique({where:{id:req.params.modeleId}});if(!item)throw probleme(404,'Modèle introuvable.');
   if(item.revision!==revision)throw probleme(409,'Modèle modifié ailleurs. Actualisez avant validation.');
   verifierQuestions(item.questions,true);
   if(!item.valide)await tx.modeleQuestionnaire.update({where:{id:item.id},data:{valide:true,revision:{increment:1},modifieParId:req.user.id}});
  });res.json({message:'Modèle validé et attribuable.'});
 }));
 async function dossier(tx,id){if(!await tx.dossierAdministratif.findUnique({where:{inscriptionId:id},select:{inscriptionId:true}}))throw probleme(404,'Dossier introuvable.');}
 router.get(dossiers,route(async(req,res)=>{
  await dossier(prisma,req.params.id);
  const items=await prisma.questionnaireAttribue.findMany({where:{inscriptionId:req.params.id},select:adminSelect,orderBy:[{createdAt:'desc'},{id:'asc'}]});
  res.json({items:items.map(row=>dtoAttribution(row,true))});
 }));
 router.post(dossiers,route(async(req,res)=>{
  const body=parse(z.object({modeleId:z.string().min(1).max(128),modeleRevision:revisionSchema,requeteId:z.string().uuid()}).strict(),req.body);
  const item=await inscriptionTransaction(prisma,async tx=>{
   await dossier(tx,req.params.id);
   const existing=await tx.questionnaireAttribue.findUnique({where:{requeteId:body.requeteId}});
   if(existing){if(existing.inscriptionId!==req.params.id||existing.modeleId!==body.modeleId||existing.modeleRevision!==body.modeleRevision||existing.auteurId!==req.user.id)throw probleme(409,'Clé de requête déjà utilisée.');return existing;}
   const modele=await tx.modeleQuestionnaire.findUnique({where:{id:body.modeleId}});
   if(!modele)throw probleme(404,'Modèle introuvable.');
   if(!modele.valide||modele.revision!==body.modeleRevision)throw probleme(409,'Le modèle doit être validé dans sa version actuelle.');
   verifierQuestions(modele.questions,true);
   return tx.questionnaireAttribue.create({data:{...body,inscriptionId:req.params.id,titre:modele.titre,categorie:modele.categorie,questions:modele.questions,auteurId:req.user.id}});
  });res.status(201).json({item:{id:item.id}});
 }));
 router.post(dossiers+'/:questionnaireId/retirer',route(async(req,res)=>{
  const {revision}=parse(z.object({revision:revisionSchema}).strict(),req.body);
  await inscriptionTransaction(prisma,async tx=>{
   await dossier(tx,req.params.id);
   const item=await tx.questionnaireAttribue.findFirst({where:{id:req.params.questionnaireId,inscriptionId:req.params.id}});
   if(!item)throw probleme(404,'Questionnaire introuvable.');
   if(item.etat==='RETIRE')return;
   if(item.etat==='ENVOYE'||item.revision!==revision)throw probleme(409,'Le questionnaire a été modifié ou soumis. Actualisez avant de poursuivre.');
   const changed=await tx.questionnaireAttribue.updateMany({where:{id:item.id,revision,etat:{in:['A_COMPLETER','BROUILLON']}},data:{etat:'RETIRE',retireAt:new Date(),retireParId:req.user.id,revision:{increment:1}}});
   if(!changed.count)throw probleme(409,'Modification concurrente. Actualisez le dossier.');
  });res.json({message:'Questionnaire retiré ; sa trace est conservée.'});
 }));
 return router;
}
