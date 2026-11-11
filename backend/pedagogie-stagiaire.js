import {Router} from 'express';
import {z} from 'zod';
import {inscriptionTransaction} from './lib/preinscriptions.js';
import {telechargerDocument} from './lib/telechargement.js';
import {route,parse,probleme,proprietaire,leconAccessible,visible,revisionSchema} from './lib/pedagogie.js';
export function pedagogieStagiaire(prisma,storage){
 const router=Router(),base='/inscriptions/:id/parcours';
 router.get(base,route(async(req,res)=>{
  const result=await prisma.$transaction(async tx=>{
   const i=await proprietaire(tx,req.params.id,req.user.id);
   const modules=await tx.modulePedagogique.findMany({where:{formationId:i.session.formationId,...visible},select:{id:true,titre:true,ordre:true,lecons:{where:visible,select:{id:true,titre:true,ordre:true,progressions:{where:{inscriptionId:i.id},select:{terminee:true,revision:true}}},orderBy:[{ordre:'asc'},{id:'asc'}]}},orderBy:[{ordre:'asc'},{id:'asc'}]});
   const items=modules.map(m=>({...m,lecons:m.lecons.map(({progressions,...l})=>({...l,progression:progressions[0]||{terminee:false,revision:null}}))}));const lessons=items.flatMap(m=>m.lecons);
   return {formation:i.session.formation,modules:items,progression:{terminees:lessons.filter(l=>l.progression.terminee).length,total:lessons.length}};
  },{isolationLevel:'RepeatableRead'});res.json(result);
 }));
 router.get(base+'/lecons/:leconId',route(async(req,res)=>{
  const result=await prisma.$transaction(async tx=>{const i=await proprietaire(tx,req.params.id,req.user.id),item=await leconAccessible(tx,req.params.leconId,i);const p=await tx.progressionLecon.findUnique({where:{inscriptionId_leconId:{inscriptionId:i.id,leconId:item.id}},select:{terminee:true,revision:true}});return {item:{...item,progression:p||{terminee:false,revision:null}}};},{isolationLevel:'RepeatableRead'});res.json(result);
 }));
 router.put(base+'/lecons/:leconId/progression',route(async(req,res)=>{
  const data=parse(z.object({terminee:z.boolean(),revision:revisionSchema.nullable()}).strict(),req.body);
  const item=await inscriptionTransaction(prisma,async tx=>{
   const i=await proprietaire(tx,req.params.id,req.user.id);await leconAccessible(tx,req.params.leconId,i);
   const where={inscriptionId_leconId:{inscriptionId:i.id,leconId:req.params.leconId}},current=await tx.progressionLecon.findUnique({where,select:{terminee:true,revision:true}});
   if((current?.terminee||false)===data.terminee)return current||{terminee:false,revision:null};
   if((current?.revision??null)!==data.revision)throw probleme(409,'La progression a changé dans un autre onglet. Rechargez la leçon.');
   const update={terminee:data.terminee,termineeAt:data.terminee?new Date():null};
   return current?tx.progressionLecon.update({where:{...where,revision:current.revision},data:{...update,revision:{increment:1}},select:{terminee:true,revision:true}}):tx.progressionLecon.create({data:{inscriptionId:i.id,leconId:req.params.leconId,...update},select:{terminee:true,revision:true}});
  });res.json({item,message:data.terminee?'Leçon déclarée terminée.':'Étude de la leçon reprise.'});
 }));
 router.get(base+'/lecons/:leconId/supports/:supportId/telecharger',route(async(req,res)=>{
  const file=await prisma.$transaction(async tx=>{const i=await proprietaire(tx,req.params.id,req.user.id);await leconAccessible(tx,req.params.leconId,i);return tx.supportLecon.findFirst({where:{id:req.params.supportId,leconId:req.params.leconId,archive:false},select:{stockageKey:true,nomOriginal:true,taille:true,typeMime:true}});},{isolationLevel:'RepeatableRead'});
  if(!file)throw probleme(404,'Support introuvable ou accès retiré.');return telechargerDocument(storage,file,res);
 }));
 return router;
}
