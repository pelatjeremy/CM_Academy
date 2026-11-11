import {Router} from 'express';
import { sessionAccepteDemandes } from '../lib/preinscriptions.js';

const cardSelect={id:true,titre:true,slug:true,resume:true,description:true,format:true,dureeMinutes:true,tarif:true,devise:true,
  pole:{select:{titre:true,slug:true}}};
const detailSelect={titre:true,slug:true,resume:true,description:true,objectifs:true,programme:true,publicVise:true,prerequis:true,
  format:true,dureeMinutes:true,tarif:true,devise:true,financement:true,
  pole:{select:{titre:true,slug:true,description:true}},
  formateurs:{select:{formateur:{select:{nom:true,biographie:true}}},orderBy:{formateur:{nom:'asc'}}},
  // Le filtre de publication du parent est répété pour documenter la frontière publique.
  sessions:{where:{visiblePubliquement:true,formation:{publiee:true},seances:{some:{}}},
    select:{id:true,preinscriptionsOuvertes:true,lieu:true,seances:{select:{debut:true,fin:true},orderBy:[{debut:'asc'},{id:'asc'}]}}}};
const money=item=>({...item,tarif:item.tarif===null?null:item.tarif.toFixed(2)});

export function publicCatalogue(prisma,clock=()=>new Date()){
  const router=Router();
  // Ne pas conserver une fiche dépubliée dans les caches navigateur/proxy.
  router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
  router.get('/catalogue/formations',async(req,res)=>{
    try{const items=await prisma.formation.findMany({where:{publiee:true},select:cardSelect,orderBy:[{titre:'asc'},{id:'asc'}]});
      res.json({formations:items.map(money)});
    }catch{res.status(503).json({error:'Le catalogue est momentanément indisponible.'});}
  });
  router.get('/formations/:slug',async(req,res)=>{
    // Même réponse pour les slugs invalides, inconnus et les brouillons.
    const missing=()=>res.status(404).json({error:'Formation introuvable.'});
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(req.params.slug)||req.params.slug.length>160)return missing();
    try{
      const item=await prisma.formation.findFirst({where:{slug:req.params.slug,publiee:true},select:detailSelect});
      if(!item)return missing();
      const {formateurs,sessions,...formation}=money(item);
      sessions.sort((a,b)=>a.seances[0].debut-b.seances[0].debut);
      const now = clock();
      const dates = sessions.map(session => ({
        lieu: session.lieu,
        seances: session.seances,
        ...(sessionAccepteDemandes(session, now) ? { preinscriptionSessionId: session.id } : {}),
      }));
      res.json({formation:{...formation,formateurs:formateurs.map(row=>row.formateur),sessions:dates}});
    }catch{res.status(503).json({error:'Cette formation est momentanément indisponible.'});}
  });
  return router;
}
