import {Router} from 'express';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {videoProbeStatus} from '../lib/videos.js';
export function demoStatus(prisma,storage){
 const router=Router();
 // Mounted only in demonstration mode, after the ADMIN session/role middleware.
 router.get('/demonstration/etat',async(req,res,next)=>{try{
  const rows=await prisma.$queryRaw`SELECT migration_name,checksum,finished_at,rolled_back_at FROM _prisma_migrations ORDER BY started_at`;
  const coherent=rows.length===15&&rows.every(row=>row.finished_at&&!row.rolled_back_at&&row.checksum===createHash('sha256').update(readFileSync(fileURLToPath(new URL('../prisma/migrations/'+row.migration_name+'/migration.sql',import.meta.url)))).digest('hex'));
  const [comptes,inscriptions,lecons,videos,pieces,supports,probe,audit]=await Promise.all([prisma.utilisateur.count(),prisma.inscription.count(),prisma.leconPedagogique.count(),prisma.videoLecon.count(),prisma.pieceJointe.count(),prisma.supportLecon.count(),videoProbeStatus(),storage.audit(prisma,{ageMs:0})]);
  const anomalies=Object.fromEntries(['temporaires','orphelins','manquants','alteres'].map(k=>[k,audit[k].length]));anomalies.inconnus=audit.inconnus;
  res.set('Cache-Control','no-store').json({demonstration:true,migrations:{terminees:rows.filter(r=>r.finished_at&&!r.rolled_back_at).length,empreintesConformes:coherent},comptes,inscriptions,lecons,versionsVideo:videos,fichiersReferences:pieces+supports+videos,audit:anomalies,ffprobe:probe.available?{available:true,version:probe.version}:{available:false}});
 }catch(error){next(error);}});
 return router;
}
