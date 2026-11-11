import {Router} from 'express';
import {randomBytes} from 'node:crypto';
import {z} from 'zod';
import {emailSchema} from '../auth/passwords.js';
import {tokenHash} from '../auth/activation.js';
import {inscriptionTransaction} from '../lib/preinscriptions.js';
import {categoriesDocumentaires} from '../lib/dossiers.js';
export function adminStagiaires(prisma){
 const router=Router(),base='/inscriptions/:id/espace-stagiaire';
 router.get(base,async(req,res)=>{
  const inscription=await prisma.inscription.findUnique({where:{id:req.params.id},select:{id:true,rattachement:{select:{createdAt:true,utilisateur:{select:{email:true}}}},invitations:{orderBy:{createdAt:'desc'},select:{id:true,email:true,createdAt:true,expireAt:true,revoqueeAt:true,utiliseeAt:true,auteur:{select:{email:true}}}}}});
  if(!inscription)return res.status(404).json({error:'Inscription introuvable.'});
  res.json(inscription);
 });
 router.post(base+'/invitation',async(req,res)=>{
  if(!z.object({}).strict().safeParse(req.body).success)return res.status(422).json({error:'Aucun champ supplémentaire n’est accepté.'});
  const token=randomBytes(32).toString('base64url'),expireAt=new Date(Date.now()+48*60*60*1000);
  try{
   const result=await inscriptionTransaction(prisma,async tx=>{
    const inscription=await tx.inscription.findUnique({where:{id:req.params.id},select:{email:true,rattachement:{select:{inscriptionId:true}}}});
    if(!inscription)return {status:404,error:'Inscription introuvable.'};
    if(inscription.rattachement)return {status:409,error:'Cette inscription est déjà rattachée.'};
    const email=emailSchema.safeParse(inscription.email);
    if(!email.success)return {status:422,error:'L’adresse email de l’inscription doit être corrigée avant invitation.'};
    const account=await tx.utilisateur.findUnique({where:{email:email.data},select:{role:true,actif:true}});
    if(account&&(account.role!=='STAGIAIRE'||!account.actif))return {status:409,error:'Ce compte existant ne peut pas être utilisé comme compte stagiaire. Aucun rôle ni mot de passe n’a été modifié.'};
    await tx.invitationStagiaire.updateMany({where:{inscriptionId:req.params.id,revoqueeAt:null,utiliseeAt:null},data:{revoqueeAt:new Date()}});
    await tx.invitationStagiaire.create({data:{inscriptionId:req.params.id,email:email.data,empreinte:tokenHash(token),expireAt,auteurId:req.user.id}});
    return {status:201};
   });
   if(result.error)return res.status(result.status).json({error:result.error});
   // Fragment : le secret n'est jamais dans la requête GET, le référent ou l'historique administratif.
   res.status(201).json({fragment:token,expireAt});
  }catch(error){if(['P2002','P2034'].includes(error.code))return res.status(409).json({error:'Invitation concurrente. Actualisez avant de réessayer.'});throw error;}
 });
 router.put('/inscriptions/:id/dossier/elements/:categorie/fichiers/:fichierId/partage',async(req,res)=>{
  if(!z.enum(categoriesDocumentaires).safeParse(req.params.categorie).success)return res.status(422).json({error:'Catégorie documentaire invalide.'});
  const parsed=z.object({partage:z.boolean(),revision:z.number().int().min(0).max(2147483646)}).strict().safeParse(req.body);
  if(!parsed.success)return res.status(422).json({error:'Décision de partage invalide.'});
  const result=await inscriptionTransaction(prisma,async tx=>{
   const file=await tx.pieceJointe.findFirst({where:{id:req.params.fichierId,inscriptionId:req.params.id,categorie:req.params.categorie},select:{id:true,partageRevision:true,partageStagiaire:true}});
   if(!file)return 404;
   if(file.partageRevision!==parsed.data.revision)return 409;
   if(file.partageStagiaire===parsed.data.partage)return 200;
   const changed=await tx.pieceJointe.updateMany({where:{id:file.id,partageRevision:parsed.data.revision},data:{partageStagiaire:parsed.data.partage,partageRevision:{increment:1}}});
   if(changed.count!==1)return 409;
   await tx.partagePieceJointe.create({data:{fichierId:file.id,partage:parsed.data.partage,auteurId:req.user.id}});
   return 200;
  });
  if(result!==200)return res.status(result).json({error:result===404?'Pièce jointe introuvable.':'Décision modifiée ailleurs. Actualisez avant de réessayer.'});
  res.json({message:'Décision de partage enregistrée.'});
 });
 return router;
}
