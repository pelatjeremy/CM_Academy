import {z} from 'zod';
import {normaliserConflitTransaction} from './preinscriptions.js';
export const revisionSchema=z.number().int().min(0).max(2147483646);
const text=max=>z.string().trim().max(max).refine(v=>!v.includes('\0'),'Caractère non autorisé.');
export const moduleSchema=z.object({titre:text(160).min(1,'Le titre est obligatoire.'),publie:z.boolean(),archive:z.boolean(),revision:revisionSchema}).strict().refine(v=>!v.archive||!v.publie,{path:['publie'],message:'Un contenu archivé doit être dépublié.'});
export const leconSchema=moduleSchema.safeExtend({contenu:text(30000)}).refine(v=>!v.publie||!!v.contenu,{path:['contenu'],message:'Renseignez le contenu avant publication.'});
export const ordreSchema=z.object({type:z.enum(['modules','lecons']),moduleId:z.string().min(1).max(128).nullable(),ids:z.array(z.string().min(1).max(128)).max(500).refine(ids=>new Set(ids).size===ids.length,'Identifiants en double.'),revision:revisionSchema}).strict();
export const supportSelect={id:true,nomOriginal:true,taille:true,typeMime:true,date:true,archive:true};
export const adminModuleSelect={id:true,titre:true,ordre:true,publie:true,archive:true,lecons:{select:{id:true,titre:true,contenu:true,ordre:true,publie:true,archive:true,supports:{select:{...supportSelect,auteur:{select:{email:true}}},orderBy:[{date:'asc'},{id:'asc'}]}},orderBy:[{ordre:'asc'},{id:'asc'}]}};
export function probleme(status,error,fields={}){return Object.assign(new Error('PEDAGOGIE'),{pedagogie:{status,error,fields}});}
export function parse(schema,value){const p=schema.safeParse(value);if(!p.success)throw probleme(422,'Vérifiez les champs du contenu pédagogique.',Object.fromEntries(p.error.issues.map(i=>[i.path.join('.')||'_form',/^(Invalid|Too |Unrecognized)/.test(i.message)?'Valeur invalide : vérifiez le type, la taille ou les choix proposés.':i.message])));return p.data;}
export const route=handler=>async(req,res,next)=>{try{await handler(req,res);}catch(e){e=normaliserConflitTransaction(e);if(e.pedagogie){const {status,...body}=e.pedagogie;return res.status(status).json(body);}if(['P2002','P2034','P2025'].includes(e.code))return res.status(409).json({code:'CONFLICT',error:'Ce parcours a changé. Vos saisies sont conservées. Rechargez les données avant de réessayer.'});next(e);}};
export async function formation(tx,id){const row=await tx.formation.findUnique({where:{id},select:{id:true,titre:true,parcoursPedagogique:{select:{revision:true}}}});if(!row)throw probleme(404,'Formation introuvable.');return row;}
export async function avancer(tx,id,revision){
 await formation(tx,id);
 if(revision===0){if(await tx.parcoursPedagogique.findUnique({where:{formationId:id}}))throw probleme(409,'Ce parcours a changé. Vos saisies sont conservées.');await tx.parcoursPedagogique.create({data:{formationId:id}});}
 else{const changed=await tx.parcoursPedagogique.updateMany({where:{formationId:id,revision},data:{revision:{increment:1}}});if(changed.count!==1)throw probleme(409,'Ce parcours a changé. Vos saisies sont conservées. Rechargez avant de réessayer.');}
 return revision+1;
}
export async function moduleDu(tx,formationId,id){const row=await tx.modulePedagogique.findFirst({where:{id,formationId}});if(!row)throw probleme(404,'Module introuvable dans cette formation.');return row;}
export async function leconDe(tx,formationId,id){const row=await tx.leconPedagogique.findFirst({where:{id,module:{formationId}}});if(!row)throw probleme(404,'Leçon introuvable dans cette formation.');return row;}
export async function proprietaire(tx,id,userId){const row=await tx.inscription.findFirst({where:{id,statut:'CONFIRMEE',rattachement:{utilisateurId:userId,utilisateur:{actif:true,role:'STAGIAIRE'}}},select:{id:true,session:{select:{formationId:true,formation:{select:{id:true,titre:true}}}}}});if(!row)throw probleme(404,'Parcours introuvable ou accès indisponible pour cette inscription.');return row;}
export const visible={publie:true,archive:false};
export async function leconAccessible(tx,id,inscription){const row=await tx.leconPedagogique.findFirst({where:{id,...visible,module:{...visible,formationId:inscription.session.formationId}},select:{id:true,titre:true,contenu:true,supports:{where:{archive:false},select:supportSelect,orderBy:[{date:'asc'},{id:'asc'}]}}});if(!row)throw probleme(404,'Leçon introuvable ou non accessible.');return row;}
