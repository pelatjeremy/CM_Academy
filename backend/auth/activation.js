import { Router } from 'express';
import { createHash } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import {
  newPasswordSchema,
  hashPassword,
  verifyPassword,
} from './passwords.js';
import { inscriptionTransaction } from '../lib/preinscriptions.js';

export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const tokenHash = (token) =>
  createHash('sha256').update(token).digest('hex');
const failure = {
  error:
    'Activation impossible. Vérifiez le lien et vos informations, ou demandez une nouvelle invitation.',
};
const valid = (inv) =>
  inv && !inv.revoqueeAt && !inv.utiliseeAt && inv.expireAt > new Date();
export function activationRoutes(prisma, protectCsrf) {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json(failure),
  });
  router.use(limiter, protectCsrf);
  router.post('/consulter', async (req, res) => {
    const parsed = z
      .object({ token: tokenSchema })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) return res.status(422).json(failure);
    const inv = await prisma.invitationStagiaire.findUnique({
      where: { empreinte: tokenHash(parsed.data.token) },
    });
    if (!valid(inv)) return res.status(400).json(failure);
    const user = await prisma.utilisateur.findUnique({
      where: { email: inv.email },
      select: { role: true, actif: true },
    });
    if (user && (user.role !== 'STAGIAIRE' || !user.actif))
      return res.status(400).json(failure);
    res.json({
      email: inv.email,
      compteExistant: !!user,
      expireAt: inv.expireAt,
    });
  });
  router.post('/activer', async (req, res) => {
    const parsed = z
      .object({ token: tokenSchema, password: z.string().min(1).max(128) })
      .strict()
      .safeParse(req.body);
    if (!parsed.success)
      return res
        .status(422)
        .json({
          ...failure,
          fields: {
            password:
              'Renseignez votre mot de passe (12 caractères minimum pour un nouveau compte).',
          },
        });
    const inv = await prisma.invitationStagiaire.findUnique({
      where: { empreinte: tokenHash(parsed.data.token) },
    });
    if (!valid(inv)) return res.status(400).json(failure);
    const existing = await prisma.utilisateur.findUnique({
      where: { email: inv.email },
    });
    if (
      existing &&
      (existing.role !== 'STAGIAIRE' ||
        !existing.actif ||
        !(await verifyPassword(existing.motDePasseHash, parsed.data.password)))
    )
      return res.status(400).json(failure);
    if (!existing && !newPasswordSchema.safeParse(parsed.data.password).success)
      return res
        .status(422)
        .json({
          error: 'Choisissez un mot de passe de 12 à 128 caractères.',
          fields: { password: '12 à 128 caractères requis.' },
        });
    const passwordHash = existing
      ? null
      : await hashPassword(parsed.data.password);
    try {
      const result = await inscriptionTransaction(prisma, async (tx) => {
        const current = await tx.invitationStagiaire.findUnique({
          where: { id: inv.id },
        });
        if (
          !valid(current) ||
          (await tx.rattachementStagiaire.findUnique({
            where: { inscriptionId: inv.inscriptionId },
          }))
        )
          return false;
        const currentUser = await tx.utilisateur.findUnique({
          where: { email: inv.email },
        });
        // Un compte apparu ou modifié pendant la vérification nécessite une nouvelle tentative.
        if (
          existing
            ? !currentUser ||
              currentUser.id !== existing.id ||
              currentUser.motDePasseHash !== existing.motDePasseHash ||
              currentUser.role !== 'STAGIAIRE' ||
              !currentUser.actif
            : !!currentUser
        )
          return false;
        const user =
          currentUser ||
          (await tx.utilisateur.create({
            data: {
              email: inv.email,
              motDePasseHash: passwordHash,
              role: 'STAGIAIRE',
            },
          }));
        const used = await tx.invitationStagiaire.updateMany({
          where: {
            id: inv.id,
            utiliseeAt: null,
            revoqueeAt: null,
            expireAt: { gt: new Date() },
          },
          data: { utiliseeAt: new Date(), utilisateurId: user.id },
        });
        if (used.count !== 1) throw new Error('ACTIVATION_CONFLICT');
        await tx.rattachementStagiaire.create({
          data: {
            inscriptionId: inv.inscriptionId,
            utilisateurId: user.id,
            invitationId: inv.id,
          },
        });
        return true;
      });
      if (!result) return res.status(400).json(failure);
      res.json({
        message:
          'Activation terminée. Vous pouvez vous connecter à votre espace stagiaire.',
      });
    } catch (error) {
      if (
        ['P2002', 'P2034'].includes(error.code) ||
        error.message === 'ACTIVATION_CONFLICT'
      )
        return res.status(400).json(failure);
      throw error;
    }
  });
  return router;
}
