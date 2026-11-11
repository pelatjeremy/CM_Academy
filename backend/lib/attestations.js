import {createHash} from 'node:crypto';
import {z} from 'zod';
export const modeleVersion = 'cmh-attestation-2';
const texte = max => z.string().trim().max(max).refine(v => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v), 'Caractère non autorisé.');
export const organismeSchema = z.object({revision:z.number().int().min(0).max(2147483646),denomination:texte(200).refine(v=>v.length>0,'Renseignez la dénomination de l’organisme.'),adresse:texte(1000).refine(v=>v.length>0,'Renseignez l’adresse de l’organisme.'),identifiant:texte(100),representant:texte(200)}).strict();
export const emissionSchema = z.object({requeteId:z.string().uuid(),empreinte:z.string().regex(/^[a-f0-9]{64}$/),couranteId:z.string().max(128).nullable(),motif:texte(500),confirmation:z.literal(true)}).strict();
export const organismeSelect = {denomination:true,adresse:true,identifiant:true,representant:true,revision:true};
export const emissionSelect = {id:true,reference:true,numero:true,courante:true,modeleVersion:true,motif:true,date:true,auteur:{select:{email:true}},pieceJointe:{select:{id:true,version:true,nomOriginal:true,taille:true,typeMime:true,date:true,partageStagiaire:true,partageRevision:true}}};
export const hashDonnees = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function erreurAttestation(status,error,fields={}) {return Object.assign(new Error('ATTESTATION'),{attestationError:{status,error,fields}});}
export const routeAttestation = handler => async(req,res,next) => {
 try {await handler(req,res);} catch(error) {
  if(error.attestationError){const {status,...body}=error.attestationError;return res.status(status).json(body);}
  if(['P2002','P2034'].includes(error.code))return res.status(409).json({error:'Émission ou modification concurrente. Votre saisie est conservée. Actualisez l’aperçu avant de réessayer.'});
  next(error);
 }
};
export async function preparerAttestation(tx,id,now=new Date()) {
 const item=await tx.inscription.findUnique({where:{id},select:{id:true,prenom:true,nom:true,dossier:{select:{inscriptionId:true}},session:{select:{id:true,lieu:true,formation:{select:{titre:true,objectifs:true,format:true,dureeMinutes:true}},seances:{select:{id:true,debut:true,fin:true},orderBy:[{debut:'asc'},{id:'asc'}]}}},presences:{select:{seanceId:true,etat:true,dureeSuivieMs:true,revision:true}}}});
 if(!item?.dossier)throw erreurAttestation(404,'Dossier introuvable. Initialisez-le depuis l’inscription.');
 const organisme=await tx.organismeAttestation.findUnique({where:{id:'principal'},select:organismeSelect});
 const courante=await tx.attestationEmission.findFirst({where:{inscriptionId:id,courante:true},select:{id:true,numero:true}});
 const fields={},seances=item.session.seances;
 for(const [field,label] of Object.entries({denomination:'Dénomination de l’organisme',adresse:'Adresse de l’organisme'}))if(!organisme?.[field])fields['organisme.'+field]=label+' : à renseigner dans les informations de l’organisme.';
 for(const field of ['prenom','nom'])if(!item[field]?.trim())fields[field]='Identité indispensable.';
 for(const [field,label] of Object.entries({titre:'Intitulé',objectifs:'Objectifs pédagogiques',format:'Format'}))if(!item.session.formation[field]?.trim())fields[field]=label+' : à renseigner dans la formation.';
 if(!seances.length)fields.seances='La session doit comporter des séances datées.';
 if(seances.some(s=>s.fin>now))fields.fin='La session n’est pas terminée.';
 const presences=new Map(item.presences.map(p=>[p.seanceId,p]));
 if(seances.some(s=>!presences.has(s.id)||presences.get(s.id).dureeSuivieMs===null||presences.get(s.id).etat==='NON_RENSEIGNE'))fields.presences='Toutes les présences doivent être renseignées ; une absence vaut zéro.';
 const suivie=seances.reduce((sum,s)=>sum+Number(presences.get(s.id)?.dureeSuivieMs??0),0);
 if(!suivie)fields.duree='Une durée de présence supérieure à zéro est indispensable.';
 const donnees={modeleVersion,organisme:organisme||{denomination:'',adresse:'',identifiant:'',representant:'',revision:0},identite:{prenom:item.prenom,nom:item.nom},formation:item.session.formation,
  lieu:item.session.lieu,sessionId:item.session.id,seances:seances.map(s=>({id:s.id,debut:s.debut.toISOString(),fin:s.fin.toISOString(),presence:presences.get(s.id)?{etat:presences.get(s.id).etat,dureeMs:Number(presences.get(s.id).dureeSuivieMs),revision:presences.get(s.id).revision}:null})),
  dureeProgrammeeMs:seances.reduce((sum,s)=>sum+s.fin.getTime()-s.debut.getTime(),0),dureeSuivieMs:suivie};
 return {donnees,empreinte:hashDonnees(donnees),couranteId:courante?.id||null,numero:(courante?.numero||0)+1,fields};
}
