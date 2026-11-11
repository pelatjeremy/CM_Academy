import {z} from 'zod';
export const etatsPresence=['NON_RENSEIGNE','PRESENT','PARTIEL','ABSENT'];
export const presenceSchema=z.object({
 etat:z.enum(etatsPresence),minutesPartielles:z.number().int().positive().max(2147483647).nullable(),
 revision:z.number().int().min(1).max(2147483646).nullable(),
 debutAttendu:z.string().datetime({offset:true}),finAttendue:z.string().datetime({offset:true}),
 motif:z.string().trim().max(500).refine(value=>!value.includes('\0')).default(''),
}).strict();
export function erreurPresence(status,error,fields={}){return Object.assign(new Error('PRESENCE'),{presenceError:{status,error,fields}});}
export const routePresence=handler=>async(req,res,next)=>{
 try{await handler(req,res);}catch(error){
  if(error.presenceError){const {status,...body}=error.presenceError;return res.status(status).json(body);}
  if(['P2002','P2034'].includes(error.code))return res.status(409).json({error:'Ce relevé a changé ailleurs. Vos saisies sont conservées. Rechargez la version enregistrée.'});
  if(error.code==='P2004'||error.meta?.code==='23514')return res.status(409).json({error:'La séance ou l’inscription a changé. Vos saisies sont conservées. Actualisez avant de réessayer.'});
  next(error);
 }
};
export const seancePresenceSelect={id:true,debut:true,fin:true};
export const presenceSelect={inscriptionId:true,seanceId:true,etat:true,dureeSuivieMs:true,debut:true,fin:true,revision:true,createdAt:true,updatedAt:true};
const presenceLectureSelect={seanceId:true,etat:true,dureeSuivieMs:true,debut:true,fin:true};
export const presenceAdminSelect={...presenceSelect,modifiePar:{select:{email:true}},historique:{select:{id:true,ancienEtat:true,nouvelEtat:true,ancienneDureeMs:true,nouvelleDureeMs:true,motif:true,date:true,auteur:{select:{email:true}}},orderBy:[{date:'asc'},{id:'asc'}]}};
export const msNumber=value=>value===null?null:Number(value);
export function presenceDto(row){
 if(!row)return null;
 return {...row,dureeSuivieMs:msNumber(row.dureeSuivieMs),...(row.historique?{historique:row.historique.map(event=>({...event,ancienneDureeMs:msNumber(event.ancienneDureeMs),nouvelleDureeMs:msNumber(event.nouvelleDureeMs)}))}:{})};
}
export async function synthesePresence(prisma,inscriptionId,utilisateurId){
 const item=await prisma.inscription.findFirst({where:{id:inscriptionId,...(utilisateurId?{rattachement:{utilisateurId}}:{})},select:{
  id:true,statut:true,session:{select:{formation:{select:{dureeMinutes:true}},seances:{select:seancePresenceSelect,orderBy:[{debut:'asc'},{id:'asc'}]}}},
  presences:{select:utilisateurId?presenceLectureSelect:presenceAdminSelect},
 }});
 if(!item)throw erreurPresence(404,'Inscription introuvable.');
 const rows=new Map(item.presences.map(row=>[row.seanceId,row]));
 const seances=item.session.seances.map(seance=>({...seance,presence:presenceDto(rows.get(seance.id)||null)}));
 const connus=seances.filter(row=>row.presence&&row.presence.etat!=='NON_RENSEIGNE');
 return {inscriptionId:item.id,statut:item.statut,dureePedagogiqueMinutes:item.session.formation.dureeMinutes,
  dureeProgrammeeMs:seances.reduce((sum,row)=>sum+row.fin.getTime()-row.debut.getTime(),0),
  dureeRenseigneeMs:connus.length?connus.reduce((sum,row)=>sum+row.presence.dureeSuivieMs,0):null,
  seancesARenseigner:seances.length-connus.length,seances,
 };
}
