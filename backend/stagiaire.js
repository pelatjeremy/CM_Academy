import { Router } from 'express';
import { telechargerDocument } from './lib/telechargement.js';
const sessionSelect = {
  id: true,
  lieu: true,
  modalitesPratiques: true,
  formation: {
    select: {
      titre: true,
      description: true,
      format: true,
      dureeMinutes: true,
    },
  },
  seances: {
    select: { id: true, debut: true, fin: true },
    orderBy: { debut: 'asc' },
  },
};
const inscriptionSelect = {
  id: true,
  statut: true,
  createdAt: true,
  session: { select: sessionSelect },
};
export function espaceStagiaire(prisma, storage) {
  const router = Router();
  router.get('/inscriptions', async (req, res) => {
    const items = await prisma.inscription.findMany({
      where: { rattachement: { utilisateurId: req.user.id } },
      select: inscriptionSelect,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ items });
  });
  router.get('/inscriptions/:id', async (req, res) => {
    const item = await prisma.inscription.findFirst({
      where: {
        id: req.params.id,
        rattachement: { utilisateurId: req.user.id },
      },
      select: inscriptionSelect,
    });
    if (!item) return res.status(404).json({ error: 'Formation introuvable.' });
    const fichiers = await prisma.pieceJointe.findMany({
      where: { inscriptionId: item.id, partageStagiaire: true },
      select: {
        id: true,
        categorie: true,
        version: true,
        nomOriginal: true,
        taille: true,
        typeMime: true,
        date: true,
      },
      orderBy: [{ categorie: 'asc' }, { version: 'desc' }],
    });
    res.json({ item, fichiers });
  });
  router.get(
    '/inscriptions/:id/fichiers/:fichierId/telecharger',
    async (req, res) => {
      const file = await prisma.pieceJointe.findFirst({
        where: {
          id: req.params.fichierId,
          inscriptionId: req.params.id,
          partageStagiaire: true,
          element: {
            dossier: {
              inscription: { rattachement: { utilisateurId: req.user.id } },
            },
          },
        },
        select: {
          stockageKey: true, stockageClassement:true,
          nomOriginal: true,
          taille: true,
          typeMime: true,
        },
      });
      if (!file)
        return res
          .status(404)
          .json({ error: 'Document introuvable ou accès retiré.' });
      return telechargerDocument(storage, file, res);
    }
  );
  return router;
}
