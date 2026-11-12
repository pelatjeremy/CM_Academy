import {filtreDocumentaire} from '../shared/document-dashboard.mjs';
import {Router} from 'express';
import {z} from 'zod';
import {initialiserDossier,categoriesDocumentaires} from './lib/dossiers.js';
import {inscriptionTransaction} from './lib/preinscriptions.js';

const rule = z.object({categorie:z.enum(categoriesDocumentaires),libelle:z.string().trim().min(1).max(160),consigne:z.string().trim().max(3000),obligatoire:z.boolean(),origine:z.enum(['STAGIAIRE','ORGANISME']),demandee:z.boolean()}).strict();
const revision=z.number().int().nonnegative().max(2147483646);
export const suiviSelect={categorie:true,libelle:true,consigne:true,obligatoire:true,origine:true,demandee:true,suiviEtat:true,suiviRevision:true,suiviHistorique:true,fichierRevision:true};
export const publicFileSelect={id:true,version:true,nomOriginal:true,taille:true,typeMime:true,date:true};
export function completude(elements){
 const required=elements.filter(e=>e.demandee&&e.obligatoire);
 const counts={total:required.length,valides:0,manquantes:0,aVerifier:0,aCorriger:0};
 for(const e of required) counts[({VALIDE:'valides',A_TRANSMETTRE:'manquantes',A_VERIFIER:'aVerifier',A_CORRIGER:'aCorriger'})[e.suiviEtat]]++;
 return {...counts,complet:counts.total===counts.valides};
}
export function evenement(req,type,data){return {type,...data,auteurId:req.user.id,auteur:req.user.email,role:req.user.role,date:new Date().toISOString()};}
function conflict(res){return res.status(409).json({error:'Cette pièce a changé. Vos saisies sont conservées. Actualisez avant de réessayer.'});}
export function suiviDocuments(prisma,storage,{stagiaire=false}={}){
 const router=Router(),base='/inscriptions/:id/documents';
 router.param('categorie',(req,res,next,value)=>z.enum(categoriesDocumentaires).safeParse(value).success?next():res.status(404).json({error:'Pièce introuvable.'}));
 async function accessible(tx,req){return tx.inscription.findFirst({where:{id:req.params.id,...(stagiaire?{rattachement:{utilisateurId:req.user.id}}:{})},select:{id:true,prenom:true,nom:true,statut:true,session:{select:{id:true,formation:{select:{titre:true}},seances:{select:{debut:true},orderBy:{debut:'asc'}}}},dossier:{select:{parcoursDocumentaire:true}}}});}
 if(!stagiaire){
 router.post(base+'/initialiser',async(req,res)=>{
  if(!z.object({}).strict().safeParse(req.body).success)return res.status(422).json({error:'Requête invalide.'});
  const result=await inscriptionTransaction(prisma,async tx=>{
   if(!await initialiserDossier(tx,req.params.id))return false;
   const i=await tx.inscription.findUnique({where:{id:req.params.id},select:{session:{select:{formation:{select:{reglesDocumentaires:true}}}}}});
   await tx.dossierAdministratif.update({where:{inscriptionId:req.params.id},data:{parcoursDocumentaire:true}});
   await tx.elementDocumentaire.createMany({data:categoriesDocumentaires.map(categorie=>({inscriptionId:req.params.id,categorie,...(i.session.formation.reglesDocumentaires.find(r=>r.categorie===categorie)||{})})),skipDuplicates:true});return true;
  });if(!result)return res.status(404).json({error:'Inscription introuvable.'});res.json({message:'Dossier documentaire initialisé.'});
 });
 router.get('/suivi-documents',async(req,res)=>{
  const q=z.object({q:z.string().max(100).optional(),formationId:z.string().max(128).optional(),sessionId:z.string().max(128).optional(),etat:z.enum(['complet','incomplet','aVerifier','aCorriger','sansPieces','aTraiter']).optional()}).strict().safeParse(req.query);
  if(!q.success)return res.status(422).json({error:'Filtres invalides.'});
  const {q:search,formationId,sessionId,etat}=q.data;
  const rows=await prisma.inscription.findMany({where:{...(sessionId?{sessionId}:{}),...(formationId?{session:{formationId}}:{}),...(search?.trim()?{AND:search.trim().split(/\s+/).map(term=>({OR:[{nom:{contains:term,mode:'insensitive'}},{prenom:{contains:term,mode:'insensitive'}}]}))}:{})},select:{id:true,prenom:true,nom:true,statut:true,session:{select:{id:true,formation:{select:{id:true,titre:true}},seances:{select:{debut:true},orderBy:{debut:'asc'}}}},dossier:{select:{parcoursDocumentaire:true,elements:{select:{categorie:true,libelle:true,demandee:true,obligatoire:true,suiviEtat:true,suiviHistorique:true,historique:{select:{date:true}},fichiers:{select:publicFileSelect,orderBy:{version:'desc'}}}}}}},orderBy:{createdAt:'desc'}});
  const items=rows.map(({dossier,...i})=>{
   const elements=dossier?.elements||[],demandes=elements.filter(e=>e.demandee);
   const dates=elements.flatMap(e=>[...e.fichiers.map(f=>f.date),...e.suiviHistorique.map(h=>h.date),...e.historique.map(h=>h.date)]).map(d=>new Date(d).getTime()).filter(Number.isFinite);
   const depots=elements.flatMap(e=>e.fichiers.map(f=>({categorie:e.categorie,libelle:e.libelle,fichier:f.nomOriginal,date:f.date,version:f.version}))).sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
   const corrections=demandes.filter(e=>e.suiviEtat==='A_CORRIGER').map(e=>{const h=e.suiviHistorique.filter(h=>h.type==='DECISION'&&h.etat==='A_CORRIGER').at(-1);return {categorie:e.categorie,libelle:e.libelle,motif:h?.motif||'',date:h?.date||null};});
   return {...i,initialise:!!dossier?.parcoursDocumentaire,completude:completude(elements),actions:{aVerifier:demandes.filter(e=>e.suiviEtat==='A_VERIFIER').length,aCorriger:corrections.length},derniereActivite:dates.length?new Date(Math.max(...dates)).toISOString():null,activite:{depots,corrections}};
  }).filter(i=>filtreDocumentaire(i,etat));
  const formations=await prisma.formation.findMany({select:{id:true,titre:true},orderBy:{titre:'asc'}});
  const sessions=await prisma.session.findMany({where:formationId?{formationId}:{},select:{id:true,formationId:true,seances:{select:{debut:true},orderBy:{debut:'asc'}}}});
  res.json({items,formations,sessions});
 });
 router.get('/formations/:formationId/documents',async(req,res)=>{
  const item=await prisma.formation.findUnique({where:{id:req.params.formationId},select:{reglesDocumentaires:true,documentsRevision:true}});if(!item)return res.sendStatus(404);res.json({item});
 });
 router.put('/formations/:formationId/documents',async(req,res)=>{
  const parsed=z.object({revision,regles:z.array(rule).max(10).refine(a=>new Set(a.map(r=>r.categorie)).size===a.length)}).strict().safeParse(req.body);
  if(!parsed.success)return res.status(422).json({error:'Configuration invalide.'});
  const r=await inscriptionTransaction(prisma,async tx=>{
   const current=await tx.formation.findUnique({where:{id:req.params.formationId},select:{reglesDocumentaires:true,documentsHistorique:true,documentsRevision:true}});
   if(!current||current.documentsRevision!==parsed.data.revision)return {count:0};
   return tx.formation.updateMany({where:{id:req.params.formationId,documentsRevision:parsed.data.revision},data:{reglesDocumentaires:parsed.data.regles,parcoursDocumentaire:true,documentsRevision:{increment:1},documentsHistorique:[...current.documentsHistorique,evenement(req,'REGLES_FORMATION',{revision:current.documentsRevision+1,avant:current.reglesDocumentaires,apres:parsed.data.regles})]}});
  });
  if(!r.count)return conflict(res);res.json({message:'Règles enregistrées pour les prochains dossiers. Les dossiers existants sont préservés.'});
 });
 router.put(base+'/:categorie/configuration',async(req,res)=>{
  const parsed=z.object({revision,regle:rule}).strict().safeParse(req.body);
  if(!parsed.success||parsed.data.regle.categorie!==req.params.categorie)return res.status(422).json({error:'Configuration invalide.'});
  const result=await inscriptionTransaction(prisma,async tx=>{
   const current=await tx.elementDocumentaire.findUnique({where:{inscriptionId_categorie:{inscriptionId:req.params.id,categorie:req.params.categorie}}});
   if(!current)return 404;if(current.suiviRevision!==parsed.data.revision)return 409;
   const event=evenement(req,'CONFIGURATION',{avant:Object.fromEntries(Object.keys(parsed.data.regle).map(k=>[k,current[k]])),apres:parsed.data.regle});
   await tx.elementDocumentaire.update({where:{inscriptionId_categorie:{inscriptionId:req.params.id,categorie:req.params.categorie}},data:{...parsed.data.regle,...(parsed.data.regle.demandee&&current.fichierRevision>0&&current.suiviEtat==='A_TRANSMETTRE'?{suiviEtat:'A_VERIFIER'}:{}),suiviRevision:{increment:1},suiviHistorique:[...current.suiviHistorique,event]}});return 200;
  });if(result===409)return conflict(res);if(result===404)return res.sendStatus(404);res.json({message:'Pièce configurée ; fichiers et historique conservés.'});
 });
 router.post(base+'/:categorie/decision',async(req,res)=>{
  const parsed=z.object({revision,version:z.number().int().positive(),etat:z.enum(['VALIDE','A_CORRIGER']),motif:z.string().trim().max(1000),requeteId:z.string().uuid()}).strict().safeParse(req.body);
  if(!parsed.success||parsed.data.etat==='A_CORRIGER'&&!parsed.data.motif)return res.status(422).json({error:'Précisez la décision et un motif pour toute correction.'});
  const d=parsed.data;
  const result=await inscriptionTransaction(prisma,async tx=>{
   const c=await tx.elementDocumentaire.findUnique({where:{inscriptionId_categorie:{inscriptionId:req.params.id,categorie:req.params.categorie}}});if(!c)return 404;
   const replay=c.suiviHistorique.find(e=>e.requeteId===d.requeteId);
   if(replay)return replay.auteurId===req.user.id&&replay.version===d.version&&replay.etat===d.etat&&replay.motif===d.motif?200:409;
   if(!c.demandee||c.suiviRevision!==d.revision||c.fichierRevision!==d.version||c.suiviEtat!=='A_VERIFIER')return 409;
   await tx.elementDocumentaire.update({where:{inscriptionId_categorie:{inscriptionId:req.params.id,categorie:req.params.categorie}},data:{suiviEtat:d.etat,suiviRevision:{increment:1},suiviHistorique:[...c.suiviHistorique,evenement(req,'DECISION',d)]}});return 200;
  });if(result===409)return conflict(res);if(result===404)return res.sendStatus(404);res.json({message:'Décision enregistrée.'});
 });
 }
 router.get(base,async(req,res)=>{
  const i=await accessible(prisma,req);if(!i)return res.status(404).json({error:'Inscription introuvable.'});
  const elements=await prisma.elementDocumentaire.findMany({where:{inscriptionId:i.id,...(stagiaire?{demandee:true,origine:'STAGIAIRE'}:{})},select:{...suiviSelect,fichiers:{where:stagiaire?{deposeParStagiaire:true}:{},select:publicFileSelect,orderBy:{version:'desc'}}},orderBy:{categorie:'asc'}});
  // Les changements de configuration et notes internes ne sont pas un message au stagiaire.
  const items=elements.map(e=>({...e,suiviHistorique:stagiaire?e.suiviHistorique.filter(h=>h.type==='DEPOT'||h.type==='DECISION').map(({type,date,version,etat,motif,role})=>({type,date,version,etat,motif,role})):e.suiviHistorique}));
  const inscription=stagiaire?undefined:{id:i.id,prenom:i.prenom,nom:i.nom,statut:i.statut,session:i.session};
  res.json({items,inscription,limiteOctets:storage.maxFileBytes,modifiable:!['ANNULEE','REFUSEE'].includes(i.statut),completude:stagiaire?undefined:completude(elements)});
 });
 return router;
}
