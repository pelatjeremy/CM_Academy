import {telechargerDocument} from '../lib/telechargement.js';
import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {categoriesDocumentaires} from '../lib/dossiers.js';
import {inscriptionTransaction} from '../lib/preinscriptions.js';
import {fichierSelect} from '../lib/documents.js';

const headersSchema = z.object({
  depotId: z.string().uuid(),
  revision: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(0).max(2147483646)),
});

export function adminFichiers(prisma, storage) {
  const router = Router();
  const base = '/inscriptions/:id/dossier/elements/:categorie/fichiers';

  async function element(req) {
    if (!z.enum(categoriesDocumentaires).safeParse(req.params.categorie).success || req.params.id.length > 128) return null;
    const row = await prisma.elementDocumentaire.findUnique({
      where: {inscriptionId_categorie: {inscriptionId: req.params.id, categorie: req.params.categorie}},
      select: {fichierRevision: true, dossier: {select: {parcoursDocumentaire: true}}},
    });
    return row?.dossier.parcoursDocumentaire ? row : null;
  }

  router.get(base, async (req, res) => {
    const row = await element(req);
    if (!row) return res.status(404).json({error: 'Élément documentaire introuvable.'});
    const versions = await prisma.pieceJointe.findMany({
      where: {inscriptionId: req.params.id, categorie: req.params.categorie},
      select: fichierSelect, orderBy: {version: 'desc'},
    });
    // La version courante est issue des pièces, lues après le contrôle d'accès.
    res.json({versions, revision: versions[0]?.version || 0, limiteOctets: storage.maxFileBytes});
  });

  router.get(base + '/:fichierId/telecharger', async (req, res) => {
    if (!await element(req)) return res.status(404).json({error: 'Élément documentaire introuvable.'});
    const file = await prisma.pieceJointe.findFirst({
      where: {id: req.params.fichierId, inscriptionId: req.params.id, categorie: req.params.categorie},
      select: {stockageKey: true, nomOriginal: true, taille: true, typeMime: true},
    });
    if (!file) return res.status(404).json({error: 'Pièce jointe introuvable.'});
    return telechargerDocument(storage, file, res);
  });

  router.post(base, async (req, res) => {
    if (!await element(req)) return res.status(404).json({error: 'Élément documentaire introuvable.'});
    const parsed = headersSchema.safeParse({depotId: req.get('x-depot-id'), revision: req.get('x-fichier-revision')});
    if (!parsed.success) return res.status(422).json({error: 'Rechargez la liste des versions avant le dépôt.'});
    const {depotId, revision} = parsed.data;
    let stockageKey;
    let status;
    let body;
    try {
      const data = await storage.receive(req, res);
      if (req.aborted) throw new Error();
      stockageKey = randomUUID();
      await storage.promote(req, stockageKey);

      const result = await inscriptionTransaction(prisma, async tx => {
        const existing = await tx.pieceJointe.findUnique({where: {depotId}});
        if (existing) {
          const same = existing.inscriptionId === req.params.id && existing.categorie === req.params.categorie
            && existing.auteurId === req.user.id && existing.empreinte === data.empreinte
            && existing.nomOriginal === data.nomOriginal && existing.taille === data.taille && existing.typeMime === data.typeMime;
          return same ? {replay: true, file: await tx.pieceJointe.findUnique({where: {depotId}, select: fichierSelect})} : {conflict: true};
        }
        const current = await tx.elementDocumentaire.findUnique({
          where: {inscriptionId_categorie: {inscriptionId: req.params.id, categorie: req.params.categorie}},
          select: {fichierRevision: true, dossier: {select: {parcoursDocumentaire: true}}},
        });
        if (!current?.dossier.parcoursDocumentaire || current.fichierRevision !== revision) return {conflict: true};
        const advanced = await tx.elementDocumentaire.updateMany({
          where: {inscriptionId: req.params.id, categorie: req.params.categorie, fichierRevision: revision},
          data: {fichierRevision: revision + 1},
        });
        if (advanced.count !== 1) return {conflict: true};
        const file = await tx.pieceJointe.create({
          data: {...data, depotId, stockageKey, version: revision + 1, inscriptionId: req.params.id, categorie: req.params.categorie, auteurId: req.user.id},
          select: fichierSelect,
        });
        return {file};
      });
      status = result.conflict ? 409 : result.replay ? 200 : 201;
      body = result.conflict
        ? {code: 'FILE_CONFLICT', error: 'Une version a été déposée ailleurs. Votre fichier et vos notes sont conservés. Actualisez les versions avant de réessayer.'}
        : {file: result.file};
    } catch (error) {
      const code = error.documentCode || error.code;
      status = 503;
      body = {error: 'Le dépôt n’a pas pu être confirmé. Réessayez avec le même fichier.'};
      if (code === 'LIMIT_FILE_SIZE') {
        status = 413;body = {error: 'Le fichier dépasse la taille autorisée.'};
      } else if (error.name === 'MulterError' || code === 'TYPE') {
        status = 422;body = {error: 'Joignez un seul fichier PDF, JPEG ou PNG dont le type correspond au contenu.'};
      } else if (['P2034', 'P2002'].includes(code)) {
        status = 409;body = {code: 'FILE_CONFLICT', error: 'Dépôt concurrent. Actualisez les versions avant de réessayer.'};
      }
    } finally {
      await storage.discardTemporary(req).catch(() => {});
      if (stockageKey) {
        // Une connexion interrompue peut masquer un commit réussi : conserver le fichier en cas de doute.
        try {
          const reference = await prisma.pieceJointe.findUnique({where: {stockageKey}, select: {id: true}});
          if (!reference) await storage.discardObject(stockageKey);
        } catch { /* La procédure d'audit identifiera les objets non référencés. */ }
      }
    }
    if (!req.aborted) res.status(status).json(body);
  });
  return router;
}
