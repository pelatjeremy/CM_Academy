import { Router } from 'express';
import { z } from 'zod';
import { inscriptionTransaction } from '../lib/preinscriptions.js';

const statuts = ['EN_ATTENTE', 'CONFIRMEE', 'REFUSEE', 'ANNULEE'];
const transitions = {
  EN_ATTENTE: ['CONFIRMEE', 'REFUSEE', 'ANNULEE'],
  CONFIRMEE: ['ANNULEE'],
  REFUSEE: [],
  ANNULEE: [],
};
const id = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
const filtres = z.object({
  q: z.string().trim().max(150).regex(/^[^\p{Cc}]*$/u).default(''),
  sessionId: id.optional(),
  statut: z.enum(statuts).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
}).strict();
const changement = z.object({
  statut: z.enum(['CONFIRMEE', 'REFUSEE', 'ANNULEE']),
  statutAttendu: z.enum(statuts),
}).strict();
const sessionSelect = {
  id: true,
  capacite: true,
  formation: { select: { titre: true } },
  seances: { orderBy: [{ debut: 'asc' }, { id: 'asc' }], select: { debut: true, fin: true } },
};
const listeSelect = {
  id: true, prenom: true, nom: true, email: true, typeDemande: true, statut: true, createdAt: true,
  session: { select: sessionSelect },
};

export const inscriptionDetailSelect = {
  ...listeSelect,
  organismeEnvisage: true,
  historique: {
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    select: {
      ancienStatut: true, nouveauStatut: true, date: true,
      auteur: { select: { email: true } },
    },
  },
};

export function adminInscriptions(prisma) {
  const router = Router();
  router.get('/inscriptions/options', async (req, res) => {
    const sessions = await prisma.session.findMany({
      where: { inscriptions: { some: {} } },
      select: sessionSelect,
      orderBy: [{ formation: { titre: 'asc' } }, { id: 'asc' }],
    });
    res.json({ sessions });
  });

  router.get('/inscriptions', async (req, res) => {
    const parsed = filtres.safeParse(req.query);
    if (!parsed.success) return res.status(422).json({ error: 'Filtres invalides.' });
    const { q, sessionId, statut, page } = parsed.data;
    const where = { sessionId, statut };
    if (q) {
      where.AND = q.split(/\s+/).map(word => ({
        OR: ['prenom', 'nom', 'email'].map(field => ({
          [field]: { contains: word, mode: 'insensitive' },
        })),
      }));
    }
    const [items, total] = await prisma.$transaction([
      prisma.inscription.findMany({
        where, select: listeSelect, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * 20, take: 20,
      }),
      prisma.inscription.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    res.json({ items, total, page });
  });

  router.get('/inscriptions/:id', async (req, res) => {
    const item = await prisma.inscription.findUnique({
      where: { id: req.params.id },
      select: inscriptionDetailSelect,
    });
    if (!item) return res.status(404).json({ error: 'Demande introuvable.' });
    res.json({ item });
  });

  router.put('/inscriptions/:id/statut', async (req, res) => {
    const parsed = changement.safeParse(req.body);
    if (!parsed.success) return res.status(422).json({ error: 'Statut invalide.' });
    const { statut, statutAttendu } = parsed.data;
    let outcome;
    try {
      outcome = await inscriptionTransaction(prisma, async tx => {
        const item = await tx.inscription.findUnique({
          where: { id: req.params.id },
          select: { id: true, statut: true, sessionId: true, session: { select: { capacite: true } } },
        });
        if (!item) return 'ABSENTE';
        if (statut === item.statut && transitions[statutAttendu].includes(statut)) return 'OK';
        if (item.statut !== statutAttendu || !transitions[item.statut].includes(statut)) return 'CONFLIT';
        if (statut === 'CONFIRMEE' && item.session.capacite !== null) {
          const confirms = await tx.inscription.count({ where: { sessionId: item.sessionId, statut: 'CONFIRMEE' } });
          if (confirms >= item.session.capacite) return 'COMPLETE';
        }

        await tx.inscription.update({ where: { id: item.id }, data: { statut } });
        await tx.changementInscription.create({
          data: { inscriptionId: item.id, ancienStatut: item.statut, nouveauStatut: statut, auteurId: req.user.id },
        });
        return 'OK';
      });
    } catch (error) {
      if (error.code !== 'P2034') throw error;
      outcome = 'CONFLIT';
    }
    if (outcome === 'ABSENTE') return res.status(404).json({ error: 'Demande introuvable.' });
    if (outcome === 'COMPLETE') return res.status(409).json({ error: 'La capacité de cette session est atteinte.', code: outcome });
    if (outcome === 'CONFLIT') return res.status(409).json({ error: 'Ce changement de statut est indisponible. Actualisez la demande.', code: outcome });
    res.json({ statut });
  });
  return router;
}
