import {Router} from 'express';
import {inscriptionTransaction} from '../lib/preinscriptions.js';
import {presenceSchema,erreurPresence,routePresence as route,presenceAdminSelect,seancePresenceSelect,presenceDto,synthesePresence} from '../lib/presences.js';
export function adminPresences(prisma,clock=()=>new Date()){
 const router=Router();
 router.get('/sessions/:id/presences',route(async(req,res)=>{
  const item=await prisma.session.findUnique({where:{id:req.params.id},select:{id:true,formation:{select:{titre:true,dureeMinutes:true}},seances:{select:seancePresenceSelect,orderBy:[{debut:'asc'},{id:'asc'}]},inscriptions:{where:{OR:[{statut:'CONFIRMEE'},{presences:{some:{}}}]},select:{id:true,prenom:true,nom:true,statut:true,presences:{select:presenceAdminSelect}},orderBy:[{nom:'asc'},{prenom:'asc'},{id:'asc'}]}}});
  if(!item)throw erreurPresence(404,'Session introuvable.');
  res.json({item:{...item,inscriptions:item.inscriptions.map(i=>({...i,presences:i.presences.map(presenceDto)}))}});
 }));
 router.get('/inscriptions/:id/presences',route(async(req,res)=>res.json(await synthesePresence(prisma,req.params.id))));
 router.put('/inscriptions/:id/seances/:seanceId/presence',route(async(req,res)=>{
  const parsed=presenceSchema.safeParse(req.body);
  if(!parsed.success)throw erreurPresence(422,'Vérifiez le relevé de présence.',Object.fromEntries(parsed.error.issues.map(issue=>[issue.path.join('.'),'Valeur invalide : vérifiez le type, la taille ou la durée.'])));
  const data=parsed.data;
  const item=await inscriptionTransaction(prisma,async tx=>{
   const inscription=await tx.inscription.findUnique({where:{id:req.params.id},select:{id:true,sessionId:true,statut:true}});
   const seance=await tx.seance.findUnique({where:{id:req.params.seanceId},select:{...seancePresenceSelect,sessionId:true}});
   if(!inscription||!seance)throw erreurPresence(404,'Inscription ou séance introuvable.');
   if(inscription.sessionId!==seance.sessionId)throw erreurPresence(422,'Cette séance n’appartient pas à la session de l’inscription.',{seance:'Séance d’une autre session.'});
   if(inscription.statut!=='CONFIRMEE')throw erreurPresence(422,'La saisie est réservée aux inscriptions confirmées.',{inscription:'Cette inscription n’est pas confirmée ; ses relevés existants restent conservés.'});
   if(seance.debut>clock())throw erreurPresence(422,'La séance n’a pas encore commencé.',{etat:'Saisie disponible uniquement après le début de la séance.'});
   if(seance.debut.getTime()!==Date.parse(data.debutAttendu)||seance.fin.getTime()!==Date.parse(data.finAttendue))throw erreurPresence(409,'Les horaires ont changé. Vos saisies sont conservées. Rechargez la séance.');
   const current=await tx.presence.findUnique({where:{inscriptionId_seanceId:{inscriptionId:inscription.id,seanceId:seance.id}},select:presenceAdminSelect});
   if((current?.revision??null)!==data.revision)throw erreurPresence(409,'Le relevé a changé ailleurs. Vos saisies sont conservées. Rechargez la version enregistrée.');
   const duration=seance.fin.getTime()-seance.debut.getTime();let ms=null;
   if(data.etat==='PARTIEL'){
    if(data.minutesPartielles===null||data.minutesPartielles*60000>=duration)throw erreurPresence(422,'Vérifiez la durée de présence partielle.',{minutesPartielles:'Minutes entières strictement entre zéro et la durée complète. Pour zéro, choisissez Absent ; pour la durée complète, Présent.'});
    ms=BigInt(data.minutesPartielles)*60000n;
   }else{
    if(data.minutesPartielles!==null)throw erreurPresence(422,'Les minutes se saisissent uniquement pour une présence partielle.',{minutesPartielles:'Videz ce champ pour cet état.'});
    if(data.etat==='PRESENT')ms=BigInt(duration);
    if(data.etat==='ABSENT')ms=0n;
   }
   if(current&&current.etat===data.etat&&current.dureeSuivieMs===ms)return current;
   if(current&&!data.motif)throw erreurPresence(422,'Un motif est obligatoire pour corriger une présence.',{motif:'Expliquez brièvement la correction.'});
   if(!current&&data.etat==='NON_RENSEIGNE')return null;
   if(current){
    const changed=await tx.presence.updateMany({where:{inscriptionId:inscription.id,seanceId:seance.id,revision:data.revision},data:{etat:data.etat,dureeSuivieMs:ms,revision:{increment:1},modifieParId:req.user.id,motifCorrection:data.motif}});
    if(changed.count!==1)throw erreurPresence(409,'Modification concurrente. Vos saisies sont conservées.');
   }else await tx.presence.create({data:{inscriptionId:inscription.id,seanceId:seance.id,etat:data.etat,dureeSuivieMs:ms,debut:seance.debut,fin:seance.fin,modifieParId:req.user.id,motifCorrection:data.motif}});
   // L'historique est écrit par le trigger dans la même transaction.
   return tx.presence.findUnique({where:{inscriptionId_seanceId:{inscriptionId:inscription.id,seanceId:seance.id}},select:presenceAdminSelect});
  });
  res.json({item:presenceDto(item),message:item?'Présence renseignée manuellement et enregistrée.':'Présence toujours non renseignée ; aucune ligne créée.'});
 }));
 return router;
}
