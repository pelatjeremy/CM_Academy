import {z} from 'zod';
export const categoriesQuestionnaires=['POSITIONNEMENT','SATISFACTION_CHAUD','SATISFACTION_FROID'];
export const typesQuestion=['TEXTE_COURT','TEXTE_LONG','CHOIX_UNIQUE','CHOIX_MULTIPLE','NOTE'];
export const revisionSchema=z.number().int().min(0).max(2147483646);
const choixSchema=z.object({id:z.string().uuid(),libelle:z.string().max(200)}).strict();
const questionSchema=z.object({id:z.string().uuid(),type:z.enum(typesQuestion),libelle:z.string().max(500),obligatoire:z.boolean(),choix:z.array(choixSchema).max(20)}).strict();
export const modeleSchema=z.object({titre:z.string().trim().min(1).max(160),categorie:z.enum(categoriesQuestionnaires),questions:z.array(questionSchema).max(40)}).strict();
export function probleme(status,error,fields={}){return Object.assign(new Error('QUESTIONNAIRE'),{questionnaire:{status,error,fields}});}
export function parse(schema,value){
 const parsed=schema.safeParse(value);
 if(!parsed.success)throw probleme(422,'Vérifiez les champs indiqués.',Object.fromEntries(parsed.error.issues.map(issue=>[issue.path.join('.'),'Valeur invalide ou limite dépassée.'])));
 return parsed.data;
}
export function verifierQuestions(questions,pourValidation=false){
 const fields={};
 if(pourValidation&&!questions.length)fields.questions='Ajoutez au moins une question.';
 const ids=new Set();
 questions.forEach((q,i)=>{
  const base='questions.'+i;
  if(ids.has(q.id))fields[base+'.libelle']='Identifiant de question en double.';ids.add(q.id);
  if(pourValidation&&!q.libelle.trim())fields[base+'.libelle']='Renseignez le libellé.';
  const choix=q.type==='CHOIX_UNIQUE'||q.type==='CHOIX_MULTIPLE';
  if(!choix&&q.choix.length)fields[base+'.choix']='Ce type de question ne comporte pas de choix.';
  if(choix&&pourValidation&&q.choix.length<2)fields[base+'.choix']='Prévoyez au moins deux choix.';
  const keys=new Set(),labels=new Set();
  q.choix.forEach(c=>{
   if(keys.has(c.id)||labels.has(c.libelle.trim().toLowerCase()))fields[base+'.choix']='Les choix doivent être distincts.';
   if(pourValidation&&!c.libelle.trim())fields[base+'.choix']='Chaque choix doit avoir un libellé.';
   keys.add(c.id);labels.add(c.libelle.trim().toLowerCase());
  });
 });
 if(Buffer.byteLength(JSON.stringify(questions))>65536)fields.questions='Le questionnaire dépasse la limite de 64 Ko.';
 if(Object.keys(fields).length)throw probleme(422,'Complétez le modèle avant validation.',fields);
}
export function verifierReponses(questions,reponses,soumission){
 if(!reponses||Array.isArray(reponses)||typeof reponses!=='object')throw probleme(422,'Réponses invalides.');
 const fields={},byId=new Map(questions.map(q=>[q.id,q]));
 for(const key of Object.keys(reponses))if(!byId.has(key))fields.reponses='Une réponse ne correspond pas à ce questionnaire.';
 for(const q of questions){
  const value=reponses[q.id];let absent=value===undefined||value===null||value===''||(Array.isArray(value)&&!value.length);
  if(typeof value==='string'&&!value.trim())absent=true;
  let valide=true;
  if(value!==undefined){
   if(q.type==='TEXTE_COURT'||q.type==='TEXTE_LONG')valide=typeof value==='string'&&value.length<=(q.type==='TEXTE_COURT'?500:5000);
   else if(q.type==='NOTE')valide=value===null||(Number.isInteger(value)&&value>=1&&value<=5);
   else if(q.type==='CHOIX_UNIQUE')valide=typeof value==='string'&&(value===''||q.choix.some(c=>c.id===value));
   else valide=Array.isArray(value)&&value.length<=20&&new Set(value).size===value.length&&value.every(v=>typeof v==='string'&&q.choix.some(c=>c.id===v));
  }
  if(!valide)fields[q.id]='Réponse invalide : respectez le type, les choix et la taille autorisés.';
  else if(soumission&&q.obligatoire&&absent)fields[q.id]='Cette réponse est obligatoire.';
 }
 if(Object.keys(fields).length)throw probleme(422,'Vérifiez vos réponses.',fields);
 if(Buffer.byteLength(JSON.stringify(reponses))>65536)fields.reponses='L’ensemble des réponses dépasse 64 Ko.';
 if(Object.keys(fields).length)throw probleme(422,'Vérifiez vos réponses.',fields);
 return reponses;
}
export const attributionSelect={id:true,inscriptionId:true,modeleId:true,modeleRevision:true,titre:true,categorie:true,questions:true,reponses:true,etat:true,revision:true,createdAt:true,updatedAt:true,auteurId:true,retireAt:true,retireParId:true,soumisAt:true,soumisParId:true,brouillonAt:true,brouillonParId:true};
export function dtoAttribution(row,admin=false){
 const {auteurId,retireParId,soumisParId,brouillonParId,...safe}=row;
 if(admin)return {...safe,reponses:row.etat==='ENVOYE'?row.reponses:null,auteur:row.auteur,retirePar:row.retirePar,soumisPar:row.soumisPar,brouillonAt:undefined};
 delete safe.auteur;delete safe.retirePar;delete safe.soumisPar;
 return safe;
}
export const routeQuestionnaire=handler=>async(req,res,next)=>{
 try{await handler(req,res);}
 catch(error){
  if(error.questionnaire){const {status,...body}=error.questionnaire;return res.status(status).json(body);}
  if(['P2002','P2034'].includes(error.code))return res.status(409).json({error:'Modification concurrente ou attribution déjà présente. Actualisez avant de réessayer.'});
  next(error);
 }
};
export function reponsesEgales(a,b){
 const keys=Object.keys(a).sort();if(JSON.stringify(keys)!==JSON.stringify(Object.keys(b).sort()))return false;
 return keys.every(key=>JSON.stringify(a[key])===JSON.stringify(b[key]));
}
