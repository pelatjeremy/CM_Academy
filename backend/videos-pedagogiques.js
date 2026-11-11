import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {inscriptionTransaction} from './lib/preinscriptions.js';
import {route,parse,probleme,revisionSchema,formation,avancer,leconDe,proprietaire,leconAccessible} from './lib/pedagogie.js';
import {videoMetadata,videoSelect,validateMp4,streamVideo} from './lib/videos.js';

const fileSelect={stockageKey:true,taille:true,empreinte:true};
export function adminVideos(prisma,storage) {
 const router=Router(),base='/formations/:formationId/contenu/lecons/:leconId/videos';
 router.get(base+'/:videoId/lecture',route(async(req,res)=>{
  await leconDe(prisma,req.params.formationId,req.params.leconId);
  const file=await prisma.videoLecon.findFirst({where:{id:req.params.videoId,leconId:req.params.leconId},select:fileSelect});
  if(!file)throw probleme(404,'Vidéo introuvable.');await streamVideo(storage,file,req,res);
 }));
 router.post(base,route(async(req,res)=>{
  await leconDe(prisma,req.params.formationId,req.params.leconId);
  const {depotId,revision}=parse(z.object({depotId:z.string().uuid(),revision:z.string().regex(/^\d+$/).transform(Number).pipe(revisionSchema)}).strict(),{depotId:req.get('x-depot-id'),revision:req.get('x-parcours-revision')});
  let stockageKey;
  try {
   const data=await storage.receive(req,res),metadata=parse(videoMetadata,req.body);
   const dureeSecondes=await validateMp4(req.documentTemporary);
   if(req.aborted)throw probleme(400,'Transfert interrompu.');
   stockageKey=randomUUID();await storage.promote(req,stockageKey);
   const result=await inscriptionTransaction(prisma,async tx=>{
    // Recheck the manager after a potentially long upload, before recording any change.
    if(!await tx.utilisateur.findFirst({where:{id:req.user.id,actif:true,role:'ADMIN'},select:{id:true}}))throw probleme(403,'Accès non autorisé.');
    const existing=await tx.videoLecon.findUnique({where:{depotId}});
    if(existing){
     if(existing.leconId!==req.params.leconId||existing.auteurId!==req.user.id||existing.empreinte!==data.empreinte||existing.nomOriginal!==data.nomOriginal||Object.keys(metadata).some(k=>existing[k]!==metadata[k]))throw probleme(409,'Cette clé de dépôt est déjà utilisée pour une autre vidéo.');
     const f=await formation(tx,req.params.formationId);return {item:await tx.videoLecon.findUnique({where:{depotId},select:videoSelect}),revision:f.parcoursPedagogique?.revision||0,replay:true};
    }
    await leconDe(tx,req.params.formationId,req.params.leconId);
    const next=await avancer(tx,req.params.formationId,revision),where={leconId:req.params.leconId};
    if(await tx.videoLecon.count({where})>=50)throw probleme(422,'50 versions vidéo maximum par leçon, retraits compris.');
    const last=await tx.videoLecon.aggregate({where,_max:{version:true}});
    await tx.videoLecon.updateMany({where:{...where,retireAt:null},data:{retireAt:new Date(),retireParId:req.user.id}});
    const item=await tx.videoLecon.create({data:{...data,...metadata,dureeSecondes,stockageKey,depotId,...where,version:(last._max.version||0)+1,auteurId:req.user.id},select:videoSelect});
    return {item,revision:next,replay:false};
   });res.status(result.replay?200:201).json({...result,message:'Version vidéo enregistrée. Les anciennes versions restent dans l’historique privé.'});
  } catch(e) {
   if(e.pedagogie||['P2002','P2034'].includes(e.code))throw e;
   if(e.code==='LIMIT_FILE_SIZE')throw probleme(413,`La vidéo dépasse la limite de ${storage.maxFileBytes} octets.`);
   if(e.documentCode==='TYPE'||e.name==='MulterError')throw probleme(422,'Joignez un seul MP4 avec un format réel et un type déclaré compatibles.');
   if(e.documentCode==='ABORT')throw probleme(400,'Transfert interrompu.');
   throw probleme(503,'Le dépôt vidéo n’a pas pu être confirmé. Réessayez avec le même fichier et les mêmes informations.');
  } finally {
   await storage.discardTemporary(req).catch(()=>{});
   if(stockageKey)try{if(!await prisma.videoLecon.findUnique({where:{stockageKey},select:{id:true}}))await storage.discardObject(stockageKey);}catch{/* Preserve uncertain commits for the common storage audit. */}
  }
 }));
 router.post(base+'/:videoId/retrait',route(async(req,res)=>{
  const {revision}=parse(z.object({revision:revisionSchema}).strict(),req.body);
  const next=await inscriptionTransaction(prisma,async tx=>{
   await leconDe(tx,req.params.formationId,req.params.leconId);
   const row=await tx.videoLecon.findFirst({where:{id:req.params.videoId,leconId:req.params.leconId}});
   if(!row)throw probleme(404,'Vidéo introuvable.');
   if(row.retireAt){const f=await formation(tx,req.params.formationId);return f.parcoursPedagogique?.revision||0;}
   const n=await avancer(tx,req.params.formationId,revision);
   await tx.videoLecon.update({where:{id:row.id},data:{retireAt:new Date(),retireParId:req.user.id}});return n;
  });res.json({revision:next,message:'Vidéo retirée du parcours. La version et son historique sont conservés.'});
 }));
 return router;
}

export function videosStagiaire(prisma,storage) {
 const router=Router();
 router.get('/inscriptions/:id/parcours/lecons/:leconId/videos/:videoId/lecture',route(async(req,res)=>{
  const file=await prisma.$transaction(async tx=>{
   const inscription=await proprietaire(tx,req.params.id,req.user.id);
   await leconAccessible(tx,req.params.leconId,inscription);
   return tx.videoLecon.findFirst({where:{id:req.params.videoId,leconId:req.params.leconId,retireAt:null},select:fileSelect});
  },{isolationLevel:'RepeatableRead'});
  if(!file)throw probleme(404,'Vidéo introuvable ou accès retiré.');
  await streamVideo(storage,file,req,res);
 }));
 return router;
}
