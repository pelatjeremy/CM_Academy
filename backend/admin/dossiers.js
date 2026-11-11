import { Router } from 'express';
import { z } from 'zod';
import { inscriptionTransaction } from '../lib/preinscriptions.js';
import { initialiserDossier, categoriesDocumentaires, etatsDocumentaires } from '../lib/dossiers.js';
import { inscriptionDetailSelect } from './inscriptions.js';
import { fichierSelect } from '../lib/documents.js';

const changesSchema = z.object({
  updatedAt: z.string().datetime({ offset: true }),
  elements: z.array(z.object({
    categorie: z.enum(categoriesDocumentaires),
    etat: z.enum(etatsDocumentaires),
    note: z.string().trim().max(500, '500 caractères maximum.')
      .refine(value => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), 'Caractère non autorisé.'),
  }).strict()).min(1).max(10),
}).strict().refine(
  value => new Set(value.elements.map(element => element.categorie)).size === value.elements.length,
  { path: ['elements'], message: 'Chaque catégorie doit apparaître une seule fois.' },
);

const dossierSelect = {
  parcoursDocumentaire: true, createdAt: true, updatedAt: true,
  elements: {
    orderBy: { categorie: 'asc' },
    select: {
      categorie: true, etat: true, note: true, fichierRevision: true,
      fichiers: {select: fichierSelect, orderBy: {version: 'desc'}},
      historique: {
        orderBy: [{ date: 'asc' }, { id: 'asc' }],
        select: {
          id: true, ancienEtat: true, nouvelEtat: true, ancienneNote: true, nouvelleNote: true,
          date: true, auteur: { select: { email: true } },
        },
      },
    },
  },
};
const detailSelect = { ...inscriptionDetailSelect, dossier: { select: dossierSelect } };

function conflict(res) {
  return res.status(409).json({
    code: 'CONFLICT',
    error: 'Ce dossier a changé. Votre saisie est conservée. Rechargez le dossier avant de réessayer.',
  });
}

export function adminDossiers(prisma) {
  const router = Router();

  // Une consultation n'appelle jamais initialiserDossier.
  router.get('/inscriptions/:id/dossier', async (req, res) => {
    const item = await prisma.inscription.findUnique({
      where: { id: req.params.id },
      select: detailSelect,
    });
    if (!item) return res.status(404).json({ error: 'Inscription introuvable.' });
    res.json({ item });
  });

  router.post('/inscriptions/:id/dossier/initialiser', async (req, res) => {
    if (!z.object({}).strict().safeParse(req.body).success) {
      return res.status(422).json({ error: 'Données d’initialisation invalides.' });
    }
    try {
      const found = await inscriptionTransaction(prisma, tx => initialiserDossier(tx, req.params.id));
      if (!found) return res.status(404).json({ error: 'Inscription introuvable.' });
      res.json({ message: 'Dossier initialisé.' });
    } catch (error) {
      if (error.code === 'P2034') return conflict(res);
      throw error;
    }
  });

  router.put('/inscriptions/:id/dossier', async (req, res) => {
    const parsed = changesSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.');
        if (key && !fields[key]) fields[key] = issue.message;
      }
      return res.status(422).json({ error: 'Vérifiez les éléments du dossier.', fields });
    }

    try {
      const result = await inscriptionTransaction(prisma, async tx => {
        const dossier = await tx.dossierAdministratif.findUnique({
          where: { inscriptionId: req.params.id },
          select: { parcoursDocumentaire: true, updatedAt: true, elements: { select: { categorie: true, etat: true, note: true } } },
        });
        if (!dossier) return { status: 404 };
        if (dossier.updatedAt.getTime() !== Date.parse(parsed.data.updatedAt)) return { status: 409 };
        if (!dossier.parcoursDocumentaire) return { status: 422 };
        const modifications = [];
        for (const element of parsed.data.elements) {
          const previous = dossier.elements.find(row => row.categorie === element.categorie);
          if (!previous) return { status: 422 };
          if (element.etat !== previous.etat || element.note !== previous.note) modifications.push({ element, previous });
        }
        if (!modifications.length) return {
          status: 200,
          item: await tx.inscription.findUnique({ where: { id: req.params.id }, select: detailSelect }),
        };
        const updatedAt = new Date(Math.max(Date.now(), dossier.updatedAt.getTime() + 1));
        const advanced = await tx.dossierAdministratif.updateMany({
          where: { inscriptionId: req.params.id, updatedAt: dossier.updatedAt },
          data: { updatedAt },
        });
        if (advanced.count !== 1) return { status: 409 };
        for (const { element, previous } of modifications) {
          await tx.elementDocumentaire.update({
            where: { inscriptionId_categorie: { inscriptionId: req.params.id, categorie: element.categorie } },
            data: { etat: element.etat, note: element.note },
          });
          await tx.changementDocumentaire.create({
            data: {
              inscriptionId: req.params.id, categorie: element.categorie,
              ancienEtat: previous.etat, nouvelEtat: element.etat,
              ancienneNote: previous.note, nouvelleNote: element.note,
              date: updatedAt, auteurId: req.user.id,
            },
          });
        }
        return {
          status: 200,
          item: await tx.inscription.findUnique({ where: { id: req.params.id }, select: detailSelect }),
        };
      });

      if (result.status === 404) return res.status(404).json({ error: 'Dossier introuvable. Initialisez le dossier depuis sa fiche.' });
      if (result.status === 409) return conflict(res);
      if (result.status === 422) return res.status(422).json({ error: 'Cet élément ne fait pas partie du parcours documentaire conservé dans ce dossier.' });
      res.json({ item: result.item, message: 'Suivi documentaire enregistré.' });
    } catch (error) {
      if (error.code === 'P2034') return conflict(res);
      throw error;
    }
  });
  return router;
}
