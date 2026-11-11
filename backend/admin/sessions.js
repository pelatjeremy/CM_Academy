import { Router } from 'express';
import {normaliserConflitTransaction} from '../lib/preinscriptions.js';
import { z } from 'zod';
import { parisInstant, parisInput, parisZone } from './paris-time.js';

const text = max => z.string({ error: 'Saisissez un texte.' }).trim().max(max, `${max} caractères maximum.`).refine(value => !value.includes('\0'), 'Caractère non autorisé.');
const id = z.string().min(1).max(128);
const version = z.string({ error: 'Rechargez la fiche.' }).datetime({ offset: true });
const offset = z.enum(['', '+01:00', '+02:00'], { error: 'Choisissez un décalage proposé.' }).default('');
const seance = z.object({ id: id.optional(), debutLocal: text(32), finLocal: text(32), debutOffset: offset, finOffset: offset }).strict();
const capacity = z.preprocess(value => value === '' ? null : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value,
  z.number({ error: 'Saisissez une capacité entière.' }).int('Capacité entière requise.').positive('La capacité doit être positive.').max(2147483647).nullable()).default(null);
const base = {
  formationId: id, capacite: capacity, lieu: text(1000).nullable().default(null), modalitesPratiques: text(5000).default(''),
  fuseauHoraire: z.literal(parisZone, { error: 'Le fuseau de saisie est Europe/Paris.' }).default(parisZone),
  visiblePubliquement: z.boolean({error:'Choisissez un état de visibilité.'}).default(false),
  seances: z.array(seance).max(100, '100 séances maximum.'),
};
const createSchema = z.object({ ...base, preinscriptionsOuvertes:z.boolean().default(false), seances: base.seances.default([]) }).strict();
const updateSchema = z.object({ ...base, preinscriptionsOuvertes:z.boolean().optional(), visiblePubliquement:base.visiblePubliquement.optional(), updatedAt: version }).strict();
const privateSchema = z.object({ updatedAt: version, consignes: text(5000).default(''),
  lienVisioconference: z.preprocess(value => typeof value === 'string' && !value.trim() ? null : value,
    text(2048).refine(value => { try { const url = new URL(value); return ['https:','http:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; } }, 'Saisissez une adresse HTTP(S) valide, sans identifiants intégrés.').nullable()).default(null),
}).strict();
const querySchema = z.object({ q: text(100).default(''), page: z.coerce.number().int().min(1).max(100000).default(1), formationId: id.optional() }).strict();
const select = { id: true, formationId: true, capacite: true, lieu: true, modalitesPratiques: true, fuseauHoraire: true, visiblePubliquement: true, preinscriptionsOuvertes: true, createdAt: true, updatedAt: true,
  formation: { select: { id: true, titre: true, dureeMinutes: true, publiee: true } },
  seances: { select: { id: true, debut: true, fin: true }, orderBy: [{ debut: 'asc' }, { id: 'asc' }] } };
function error(code, fields = {}) { const e = new Error(code); e.code = code; e.fields = fields; throw e; }
function invalid(res, e) {
  const fields = {}; for (const issue of e.issues) { const key = issue.path.join('.'); if (key && !fields[key]) fields[key] = issue.message; }
  return res.status(422).json({ error: 'Vérifiez les informations de la session.', fields });
}
function schedule(rows) {
  const errors = {}; const result = []; const seen = new Set();
  rows.forEach((row, index) => {
    if (row.id && seen.has(row.id)) errors[`seances.${index}.id`] = 'Cette séance est répétée.';
    if (row.id) seen.add(row.id);
    const start = parisInstant(row.debutLocal, row.debutOffset), end = parisInstant(row.finLocal, row.finOffset);
    if (start.error) errors[`seances.${index}.debut${start.field}`] = start.error;
    if (end.error) errors[`seances.${index}.fin${end.field}`] = end.error;
    if (start.instant && end.instant) {
      if (end.instant <= start.instant) errors[`seances.${index}.finLocal`] = 'La fin doit être strictement après le début.';
      result.push({ id: row.id, debut: start.instant, fin: end.instant, index });
    }
  });
  result.sort((a,b) => a.debut - b.debut || a.fin - b.fin);
  let last;
  for (const row of result) {
    if (last && row.debut < last.fin) errors[`seances.${row.index}.debutLocal`] = 'Cette séance chevauche une autre séance de la session.';
    if (!last || row.fin > last.fin) last = row;
  }
  if (Object.keys(errors).length) error('INVALID', errors);
  return result;
}
function summary(item) {
  const milliseconds = item.seances.reduce((total, row) => total + row.fin.getTime() - row.debut.getTime(), 0);
  return { totalMinutes: milliseconds / 60000, announcedMinutes: item.formation.dureeMinutes,
    durationMismatch: item.formation.dureeMinutes !== null && milliseconds !== item.formation.dureeMinutes * 60000 };
}
function dto(item, detail = false) {
  const { seances, ...safe } = item;
  return { ...safe, ...summary(item), nombreSeances: seances.length, debut: seances[0]?.debut || null, fin: seances.at(-1)?.fin || null,
    ...(detail ? { seances: seances.map(row => { const start = parisInput(row.debut), end = parisInput(row.fin); return {
      id: row.id, debut: row.debut, fin: row.fin, debutLocal: start.local, finLocal: end.local, debutOffset: start.offset, finOffset: end.offset,
    }; }) } : {}) };
}
async function current(tx, sessionId, expected) {
  const row = await tx.session.findUnique({ where: { id: sessionId }, select: { id: true, updatedAt: true, formationId: true } });
  if (!row) error('NOT_FOUND');
  if (row.updatedAt.getTime() !== new Date(expected).getTime()) error('CONFLICT');
  return row;
}
async function advance(tx, row, data = {}) {
  const updatedAt = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
  const result = await tx.session.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data: { ...data, updatedAt } });
  if (result.count !== 1) error('CONFLICT');
  return updatedAt;
}
async function transaction(res, prisma, action, status = 200) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return res.status(status).json(await prisma.$transaction(action, { isolationLevel: 'Serializable' })); }
    catch (e) {
      e = normaliserConflitTransaction(e);
      if (e.code === 'P2034' && attempt < 2) continue;
      if (e.code === 'CONFLICT' || e.code === 'P2034') return res.status(409).json({ code: 'CONFLICT', error: 'Cette session a été modifiée ailleurs. Votre saisie est conservée. Rechargez la fiche avant de réessayer.' });
      if (e.code === 'NOT_FOUND' || e.code === 'P2025') return res.status(404).json({ error: 'Session introuvable.' });
      if (e.code === 'INVALID') return res.status(422).json({ error: 'Vérifiez les informations de la session.', fields: e.fields });
      if (e.code === 'P2004' || e.meta?.code === '23514') return res.status(409).json({error:'Une présence vient de verrouiller la séance. Rechargez la fiche ; aucun horaire n’a été modifié.',fields:{seances:'Séance avec relevés de présence : horaires verrouillés.'}});
      if (e.code === 'P2003') return res.status(422).json({ error: 'Une référence a changé. Vérifiez la formation et les séances.' });
      throw e;
    }
  }
}
export function adminSessions(prisma) {
  const router = Router();
  router.get('/sessions/options', async (req,res) => res.json({ formations: await prisma.formation.findMany({ select: { id: true, titre: true, publiee: true, dureeMinutes: true }, orderBy: [{ titre: 'asc' }, { id: 'asc' }] }) }));
  router.post('/sessions/verifier-horaires', async(req,res)=>{
    const parsed=createSchema.pick({formationId:true,seances:true}).safeParse(req.body);if(!parsed.success)return invalid(res,parsed.error);
    try{
      const rows=schedule(parsed.data.seances);
      const formation=await prisma.formation.findUnique({where:{id:parsed.data.formationId},select:{dureeMinutes:true}});
      if(!formation)return res.status(422).json({error:'Choisissez une formation existante.',fields:{formationId:'Formation introuvable.'}});
      res.json(summary({formation,seances:rows}));
    }catch(e){if(e.code==='INVALID')return res.status(422).json({error:'Vérifiez les horaires.',fields:e.fields});throw e;}
  });
  router.get('/sessions', async (req,res) => {
    const parsed = querySchema.safeParse(req.query); if (!parsed.success) return invalid(res,parsed.error);
    const { q,page,formationId } = parsed.data;
    const where = { ...(formationId ? { formationId } : {}), ...(q ? { OR: [{ formation: { titre: { contains: q, mode: 'insensitive' } } }, { lieu: { contains: q, mode: 'insensitive' } }, { modalitesPratiques: { contains: q, mode: 'insensitive' } }] } : {}) };
    const [items,total] = await prisma.$transaction([prisma.session.findMany({ where,select,orderBy:[{createdAt:'desc'},{id:'asc'}],skip:(page-1)*20,take:20 }),prisma.session.count({where})],{isolationLevel:'RepeatableRead'});
    res.json({items:items.map(item=>dto(item)),total,page,pageSize:20});
  });
  router.get('/sessions/:id', async(req,res) => { const item=await prisma.session.findUnique({where:{id:req.params.id},select});if(!item)return res.status(404).json({error:'Session introuvable.'});res.json({item:dto(item,true)}); });
  router.get('/sessions/:id/acces-prive', async(req,res) => {
    const item=await prisma.session.findUnique({where:{id:req.params.id},select:{updatedAt:true,accesPrive:{select:{lienVisioconference:true,consignes:true}}}});
    if(!item)return res.status(404).json({error:'Session introuvable.'});res.json({updatedAt:item.updatedAt,accesPrive:item.accesPrive});
  });
  async function save(req,res) {
    const parsed=(req.params.id?updateSchema:createSchema).safeParse(req.body);if(!parsed.success)return invalid(res,parsed.error);
    let rows;try{rows=schedule(parsed.data.seances);}catch(e){return res.status(422).json({error:'Vérifiez les dates et horaires de Paris.',fields:e.fields});}
    if(parsed.data.visiblePubliquement && !rows.length)return res.status(422).json({error:'Ajoutez les dates avant de rendre cette session visible.',fields:{visiblePubliquement:'Une session visible doit comporter au moins une séance.'}});
    return transaction(res,prisma,async tx=>{
      const {seances,updatedAt,...data}=parsed.data;data.lieu=data.lieu||null;
      const previous=req.params.id?await current(tx,req.params.id,updatedAt):null;
      if (previous && data.capacite !== null) {
        const confirms = await tx.inscription.count({ where: { sessionId: previous.id, statut: 'CONFIRMEE' } });
        if (confirms > data.capacite) error('INVALID', { capacite: 'La capacité ne peut pas être inférieure au nombre de places confirmées.' });
      }
      if (previous && previous.formationId !== data.formationId) {
        const demandes = await tx.inscription.count({ where: { sessionId: previous.id } });
        if (demandes) error('INVALID', { formationId: 'Cette session a déjà reçu des demandes et doit rester liée à sa formation.' });
      }
      if(!await tx.formation.findUnique({where:{id:data.formationId},select:{id:true}}))error('INVALID',{formationId:'Cette formation n’existe plus.'});
      const existingIds=rows.filter(row=>row.id).map(row=>row.id);
      if(existingIds.length && (!previous || await tx.seance.count({where:{id:{in:existingIds},sessionId:previous.id}})!==existingIds.length))error('INVALID',{seances:'Une séance ne correspond pas à cette session. Rechargez la fiche.'});
      if(previous){
        const locked=await tx.seance.findMany({where:{sessionId:previous.id,presences:{some:{}}},select:{id:true,debut:true,fin:true}});
        for(const old of locked){const next=rows.find(row=>row.id===old.id);if(!next||next.debut.getTime()!==old.debut.getTime()||next.fin.getTime()!==old.fin.getTime())error('INVALID',{seances:'Une séance comporte des présences : ses horaires et sa durée sont verrouillés. Conservez-la ; ajoutez une nouvelle séance si nécessaire.'});}
      }
      const item=previous?(await advance(tx,previous,data),previous):await tx.session.create({data,select:{id:true}});
      await tx.seance.deleteMany({where:{sessionId:item.id,...(existingIds.length?{id:{notIn:existingIds}}:{})}});
      for(const row of rows){const times={debut:row.debut,fin:row.fin};if(row.id)await tx.seance.update({where:{id:row.id},data:times});else await tx.seance.create({data:{...times,sessionId:item.id}});}
      return {item:dto(await tx.session.findUnique({where:{id:item.id},select}),true)};
    },req.params.id?200:201);
  }
  router.post('/sessions',save);router.put('/sessions/:id',save);
  router.put('/sessions/:id/acces-prive', async(req,res)=>{
    const parsed=privateSchema.safeParse(req.body);if(!parsed.success)return invalid(res,parsed.error);
    return transaction(res,prisma,async tx=>{
      const row=await current(tx,req.params.id,parsed.data.updatedAt);const updatedAt=await advance(tx,row);
      const {updatedAt:expected,...data}=parsed.data;
      const accesPrive=await tx.sessionAccesPrive.upsert({where:{sessionId:row.id},create:{sessionId:row.id,...data},update:data,select:{lienVisioconference:true,consignes:true}});
      return {updatedAt,accesPrive};
    });
  });
  router.all(['/sessions','/sessions/:id','/sessions/:id/acces-prive'],(req,res)=>res.status(405).json({error:'Action non disponible. Aucune suppression de session.'}));
  return router;
}
