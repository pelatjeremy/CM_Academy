import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {inscriptionTransaction} from '../lib/preinscriptions.js';
import {telechargerDocument} from '../lib/telechargement.js';
import {videoProbeStatus} from '../lib/videos.js';
import {route,parse,probleme,moduleSchema,leconSchema,ordreSchema,revisionSchema,adminModuleSelect,supportSelect,formation,avancer,moduleDu,leconDe} from '../lib/pedagogie.js';
export function adminPedagogie(prisma,storage,videoMaxFileBytes){
 const router=Router(),base='/formations/:formationId/contenu';
 router.get(base,route(async(req,res)=>{
  const result=await prisma.$transaction(async tx=>{const f=await formation(tx,req.params.formationId);return {formation:{id:f.id,titre:f.titre},revision:f.parcoursPedagogique?.revision||0,modules:await tx.modulePedagogique.findMany({where:{formationId:f.id},select:adminModuleSelect,orderBy:[{ordre:'asc'},{id:'asc'}]})};},{isolationLevel:'RepeatableRead'});
  res.json({...result,videoMaxFileBytes,videoProbe:await videoProbeStatus()});
 }));
 for(const kind of ['modules','lecons']){
  const create=kind==='modules'?base+'/modules':base+'/modules/:moduleId/lecons';
  const update=base+'/'+kind+'/:contenuId';
  async function save(req,res){
   const {revision,...data}=parse(kind==='modules'?moduleSchema:leconSchema,req.body),formationId=req.params.formationId;
   const result=await inscriptionTransaction(prisma,async tx=>{
    if(kind==='modules'&&req.params.contenuId)await moduleDu(tx,formationId,req.params.contenuId);
    if(kind==='lecons'){if(req.params.contenuId)await leconDe(tx,formationId,req.params.contenuId);else await moduleDu(tx,formationId,req.params.moduleId);}
    const next=await avancer(tx,formationId,revision),delegate=kind==='modules'?tx.modulePedagogique:tx.leconPedagogique;
    let item;
    if(req.params.contenuId)item=await delegate.update({where:{id:req.params.contenuId},data,select:{id:true}});
    else{
     const where=kind==='modules'?{formationId}:{moduleId:req.params.moduleId};
     if(await delegate.count({where})>=(kind==='modules'?200:500))throw probleme(422,'Limite de contenus atteinte.');
     const last=await delegate.aggregate({where,_max:{ordre:true}});item=await delegate.create({data:{...data,...where,ordre:(last._max.ordre??-1)+1},select:{id:true}});
    }
    return {item,revision:next};
   });
   res.status(req.params.contenuId?200:201).json({...result,message:'Contenu pédagogique enregistré.'});
  }
  router.post(create,route(save));router.put(update,route(save));
 }
 router.put(base+'/ordre',route(async(req,res)=>{
  const data=parse(ordreSchema,req.body);
  const revision=await inscriptionTransaction(prisma,async tx=>{
   if(data.type==='lecons'){if(!data.moduleId)throw probleme(422,'Choisissez un module.');await moduleDu(tx,req.params.formationId,data.moduleId);}
   else if(data.moduleId!==null)throw probleme(422,'Le module ne doit pas être renseigné pour ordonner les modules.');
   const next=await avancer(tx,req.params.formationId,data.revision),delegate=data.type==='modules'?tx.modulePedagogique:tx.leconPedagogique,where=data.type==='modules'?{formationId:req.params.formationId}:{moduleId:data.moduleId};
   const rows=await delegate.findMany({where,select:{id:true,ordre:true}});
   if(JSON.stringify(rows.map(r=>r.id).sort())!==JSON.stringify([...data.ids].sort()))throw probleme(422,'La liste doit contenir tous les éléments, y compris les archives, une seule fois.');
   const offset=Math.max(0,...rows.map(r=>r.ordre))+data.ids.length+1;
   if(offset>1000000)throw probleme(422,'Ordre invalide.');
   // Deux passes évitent les collisions d'index unique pendant les permutations.
   for(const [i,id]of data.ids.entries())await delegate.update({where:{id},data:{ordre:offset+i}});
   for(const [i,id]of data.ids.entries())await delegate.update({where:{id},data:{ordre:i}});
   return next;
  });res.json({revision,message:'Ordre enregistré.'});
 }));
 const files=base+'/lecons/:leconId/supports';
 router.get(files+'/:supportId/telecharger',route(async(req,res)=>{
  await leconDe(prisma,req.params.formationId,req.params.leconId);
  const file=await prisma.supportLecon.findFirst({where:{id:req.params.supportId,leconId:req.params.leconId},select:{stockageKey:true,nomOriginal:true,taille:true,typeMime:true}});if(!file)throw probleme(404,'Support introuvable.');return telechargerDocument(storage,file,res);
 }));
 router.put(files+'/:supportId',route(async(req,res)=>{
  const {revision,archive}=parse(z.object({revision:revisionSchema,archive:z.boolean()}).strict(),req.body);
  const next=await inscriptionTransaction(prisma,async tx=>{await leconDe(tx,req.params.formationId,req.params.leconId);const row=await tx.supportLecon.findFirst({where:{id:req.params.supportId,leconId:req.params.leconId}});if(!row)throw probleme(404,'Support introuvable.');const n=await avancer(tx,req.params.formationId,revision);await tx.supportLecon.update({where:{id:row.id},data:{archive}});return n;});res.json({revision:next,message:'Disponibilité du support enregistrée.'});
 }));
 router.post(files,route(async(req,res)=>{
  await leconDe(prisma,req.params.formationId,req.params.leconId);
  const {depotId,revision}=parse(z.object({depotId:z.string().uuid(),revision:z.string().regex(/^\d+$/).transform(Number).pipe(revisionSchema)}).strict(),{depotId:req.get('x-depot-id'),revision:req.get('x-parcours-revision')});
  let stockageKey;
  try{
   const data=await storage.receive(req,res);if(data.typeMime!=='application/pdf')throw probleme(422,'Joignez un PDF valide.');if(req.aborted)throw new Error('ABORT');stockageKey=randomUUID();await storage.promote(req,stockageKey);
   const result=await inscriptionTransaction(prisma,async tx=>{
    const existing=await tx.supportLecon.findUnique({where:{depotId}});
    if(existing){if(existing.leconId!==req.params.leconId||existing.auteurId!==req.user.id||existing.empreinte!==data.empreinte||existing.nomOriginal!==data.nomOriginal)throw probleme(409,'Cette clé de dépôt est déjà utilisée.');const f=await formation(tx,req.params.formationId);return {item:await tx.supportLecon.findUnique({where:{depotId},select:supportSelect}),revision:f.parcoursPedagogique?.revision||0,replay:true};}
    await leconDe(tx,req.params.formationId,req.params.leconId);const next=await avancer(tx,req.params.formationId,revision);
    if(await tx.supportLecon.count({where:{leconId:req.params.leconId}})>=50)throw probleme(422,'50 supports maximum par leçon, archives comprises.');
    const item=await tx.supportLecon.create({data:{...data,stockageKey,depotId,leconId:req.params.leconId,auteurId:req.user.id},select:supportSelect});return {item,revision:next,replay:false};
   });res.status(result.replay?200:201).json({...result,message:'Support PDF enregistré.'});
  }catch(e){if(e.pedagogie||['P2002','P2034'].includes(e.code))throw e;if(e.code==='LIMIT_FILE_SIZE')throw probleme(413,'Le PDF dépasse la limite autorisée.');if(e.documentCode==='TYPE'||e.name==='MulterError')throw probleme(422,'Joignez un seul PDF dont l’extension, le type déclaré et le contenu correspondent.');throw probleme(503,'Le dépôt n’a pas pu être confirmé. Réessayez avec le même fichier.');}
  finally{await storage.discardTemporary(req).catch(()=>{});if(stockageKey)try{if(!await prisma.supportLecon.findUnique({where:{stockageKey},select:{id:true}}))await storage.discardObject(stockageKey);}catch{/* Un commit incertain est conservé pour l'audit. */}}
 }));
 router.delete([base,base+'/*reste'],(req,res)=>res.status(405).json({error:'Aucune suppression physique. Archivez le contenu pour conserver son historique et les progressions.'}));
 return router;
}
