import {Router} from 'express';
import {routePresence,synthesePresence} from './lib/presences.js';
export function presencesStagiaire(prisma){
 const router=Router();
 router.get('/inscriptions/:id/presences',routePresence(async(req,res)=>{
  res.json(await synthesePresence(prisma,req.params.id,req.user.id));
 }));
 return router;
}
