import { Router } from 'express';
import { z } from 'zod';
import { inscriptionTransaction } from './lib/preinscriptions.js';
import {
  revisionSchema,
  parse,
  probleme,
  verifierReponses,
  attributionSelect,
  dtoAttribution,
  reponsesEgales,
  routeQuestionnaire as route,
} from './lib/questionnaires.js';
export function questionnairesStagiaire(prisma) {
  const router = Router(),
    base = '/inscriptions/:id/questionnaires';
  const owner = (req) => ({
    inscriptionId: req.params.id,
    dossier: { inscription: { rattachement: { utilisateurId: req.user.id } } },
  });
  async function inscription(tx, req) {
    if (
      !(await tx.inscription.findFirst({
        where: {
          id: req.params.id,
          rattachement: { utilisateurId: req.user.id },
        },
        select: { id: true },
      }))
    )
      throw probleme(404, 'Inscription introuvable.');
  }
  router.get(
    base,
    route(async (req, res) => {
      await inscription(prisma, req);
      const items = await prisma.questionnaireAttribue.findMany({
        where: owner(req),
        select: {
          id: true,
          titre: true,
          categorie: true,
          etat: true,
          soumisAt: true,
          retireAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
      res.json({ items });
    })
  );
  router.get(
    base + '/:questionnaireId',
    route(async (req, res) => {
      const item = await prisma.questionnaireAttribue.findFirst({
        where: { ...owner(req), id: req.params.questionnaireId },
        select: attributionSelect,
      });
      if (!item) throw probleme(404, 'Questionnaire introuvable.');
      res.json({ item: dtoAttribution(item) });
    })
  );
  for (const [suffix, method, submit] of [
    ['brouillon', 'put', false],
    ['soumettre', 'post', true],
  ])
    router[method](
      base + '/:questionnaireId/' + suffix,
      route(async (req, res) => {
        const { revision, reponses } = parse(
          z
            .object({
              revision: revisionSchema,
              reponses: z.record(z.string().uuid(), z.unknown()),
            })
            .strict(),
          req.body
        );
        const item = await inscriptionTransaction(prisma, async (tx) => {
          const current = await tx.questionnaireAttribue.findFirst({
            where: { ...owner(req), id: req.params.questionnaireId },
            select: attributionSelect,
          });
          if (!current) throw probleme(404, 'Questionnaire introuvable.');
          if (
            current.etat === 'ENVOYE' &&
            submit &&
            reponsesEgales(current.reponses, reponses)
          )
            return current;
          if (
            ['ENVOYE', 'RETIRE'].includes(current.etat) ||
            current.revision !== revision
          )
            throw probleme(
              409,
              'Le questionnaire a été modifié, envoyé ou retiré. Vos saisies sont conservées.'
            );
          verifierReponses(current.questions, reponses, submit);
          const changed = await tx.questionnaireAttribue.updateMany({
            where: {
              id: current.id,
              revision,
              etat: { in: ['A_COMPLETER', 'BROUILLON'] },
            },
            data: {
              reponses,
              etat: submit ? 'ENVOYE' : 'BROUILLON',
              revision: { increment: 1 },
              ...(submit
                ? { soumisAt: new Date(), soumisParId: req.user.id }
                : { brouillonAt: new Date(), brouillonParId: req.user.id }),
            },
          });
          if (!changed.count)
            throw probleme(
              409,
              'Modification concurrente. Vos saisies sont conservées.'
            );
          return tx.questionnaireAttribue.findUnique({
            where: { id: current.id },
            select: attributionSelect,
          });
        });
        res.json({
          item: dtoAttribution(item),
          message: submit
            ? 'Réponses envoyées définitivement.'
            : 'Brouillon enregistré.',
        });
      })
    );
  return router;
}
