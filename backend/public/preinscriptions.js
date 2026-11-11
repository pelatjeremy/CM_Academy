import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { inscriptionTransaction, sessionAccepteDemandes } from '../lib/preinscriptions.js';
import { initialiserDossier } from '../lib/dossiers.js';

const nom = z.string().trim().min(1).max(100).regex(/\p{L}/u).regex(/^[^\p{Cc}]+$/u);
const demande = z.object({
  prenom: nom,
  nom,
  email: z.string().trim().toLowerCase().max(254).email(),
  typeDemande: z.enum(['PARTICULIER', 'PROFESSIONNEL_FINANCEMENT']),
  organismeEnvisage: z.string().trim().max(160).regex(/^[^\p{Cc}]*$/u).optional(),
}).strict().refine(
  value => value.typeDemande === 'PROFESSIONNEL_FINANCEMENT' || !value.organismeEnvisage,
  { path: ['organismeEnvisage'] },
);

const messages = {
  prenom: 'Saisissez un prénom valide (100 caractères maximum).',
  nom: 'Saisissez un nom valide (100 caractères maximum).',
  email: 'Saisissez une adresse email valide.',
  typeDemande: 'Choisissez un type de demande.',
  organismeEnvisage: 'Réservez ce champ aux demandes de financement (160 caractères maximum).',
};
const recu = { message: 'Demande reçue, en attente de validation' };

export function publicPreinscriptions(prisma, clock = () => new Date()) {
  const router = Router();
  const limit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Trop de tentatives. Réessayez dans quelques minutes.' },
  });

  router.post('/sessions/:id/preinscriptions', limit, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!req.is('application/json') || req.get('sec-fetch-site') === 'cross-site') {
      return res.status(400).json({ error: 'Requête non valide.' });
    }
    const parsed = demande.safeParse(req.body);
    if (!parsed.success) {
      const fields = Object.fromEntries(parsed.error.issues
        .map(issue => issue.path[0]).filter(field => Object.hasOwn(messages, field))
        .map(field => [field, messages[field]]));
      return res.status(422).json({ error: 'Vérifiez les informations saisies.', fields });
    }
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(req.params.id)) {
      return res.status(404).json({ error: 'Cette session ne reçoit pas de demandes.' });
    }

    try {
      const available = await inscriptionTransaction(prisma, async tx => {
        const session = await tx.session.findFirst({
          where: { id: req.params.id, visiblePubliquement: true, formation: { publiee: true } },
          select: {
            preinscriptionsOuvertes: true,
            seances: { select: { debut: true }, orderBy: { debut: 'asc' }, take: 1 },
          },
        });
        if (!session || !sessionAccepteDemandes(session, clock())) return false;

        const [created] = await tx.inscription.createManyAndReturn({
          data: [{ ...parsed.data, organismeEnvisage: parsed.data.organismeEnvisage || null, sessionId: req.params.id }],
          skipDuplicates: true,
          select: { id: true },
        });
        if (created) {
          await initialiserDossier(tx, created.id);
          await tx.changementInscription.create({
            data: { inscriptionId: created.id, nouveauStatut: 'EN_ATTENTE' },
          });
        }
        return true;
      });

      if (!available) return res.status(404).json({ error: 'Cette session ne reçoit pas de demandes.' });
      return res.status(202).json(recu);
    } catch (error) {
      if (error.code === 'P2034') return res.status(503).json({ error: 'Réessayez dans quelques instants.' });
      throw error;
    }
  });
  return router;
}
