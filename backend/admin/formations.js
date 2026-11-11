import { Router } from 'express';
import {normaliserConflitTransaction} from '../lib/preinscriptions.js';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const content = max => z.string({ error: 'Saisissez un texte.' }).trim().max(max, `${max} caractères maximum.`)
  .refine(value => !value.includes('\0'), 'Ce caractère n’est pas autorisé.');
const nullableText = schema => z.preprocess(value => typeof value === 'string' && !value.trim() ? null : value, schema.nullable());
const idSchema = z.string().min(1).max(128);
const versionSchema = z.string({ error: 'Rechargez la fiche avant de modifier.' }).datetime({ offset: true, error: 'Version de fiche invalide. Rechargez la fiche.' });
const duration = z.preprocess(value => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value === '' ? null : value,
  z.number({ error: 'Saisissez une durée en minutes entières.' }).int('La durée doit être entière.').positive('La durée doit être positive.').max(2147483647, 'Durée trop élevée.').nullable());
const money = nullableText(content(32).regex(/^\d{1,10}(?:[.,]\d{1,2})?$/, 'Montant positif ou nul, avec deux décimales maximum.').transform(value => value.replace(',', '.')));
const fields = {
  titre: content(160).min(1, 'Le titre est obligatoire, même pour un brouillon.'),
  slug: nullableText(content(160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Minuscules, chiffres et tirets simples uniquement.')).default(null),
  resume: content(1000).default(''), description: content(5000).default(''),
  objectifs: content(5000).default(''), programme: content(10000).default(''),
  publicVise: content(3000).default(''), prerequis: content(3000).default(''),
  dureeMinutes: duration.default(null),
  format: nullableText(z.enum(['WEBINAIRE', 'PRESENTIEL', 'HYBRIDE'], { error: 'Choisissez un format proposé.' })).default(null),
  tarif: money.default(null), devise: z.preprocess(value => typeof value === 'string' && !value.trim() ? undefined : value,
    content(3).regex(/^[A-Z]{3}$/, 'Code monétaire de trois lettres majuscules, par exemple EUR.').default('EUR')),
  financement: content(3000).default(''), parcoursDocumentaire: z.boolean({ error: 'Choisissez une valeur valide.' }).default(false),
  poleId: nullableText(idSchema).default(null),
  formateurIds: z.array(idSchema, { error: 'Choisissez les formateurs dans la liste.' }).max(100, '100 formateurs maximum.')
    .refine(ids => new Set(ids).size === ids.length, 'Un formateur ne peut être associé qu’une fois.').default([]),
};
const createSchema = z.object(fields).strict();
const updateSchema = z.object({ ...fields, updatedAt: versionSchema }).strict();
const publicationSchema = z.object({ publiee: z.boolean(), updatedAt: versionSchema }).strict();
const querySchema = z.object({
  q: content(100).default(''), page: z.coerce.number().int().min(1).max(100000).default(1),
  poleId: idSchema.optional(), publication: z.enum(['brouillon', 'publiee']).optional(),
}).strict();
const select = Object.fromEntries(['id', 'titre', 'slug', 'resume', 'description', 'objectifs', 'programme', 'publicVise', 'prerequis',
  'dureeMinutes', 'format', 'tarif', 'devise', 'financement', 'parcoursDocumentaire', 'poleId', 'publiee', 'updatedAt'].map(key => [key, true]));
select.pole = { select: { id: true, titre: true } };
select.formateurs = { select: { formateur: { select: { id: true, nom: true } } }, orderBy: { formateurId: 'asc' } };
const publicationRequirements = {
  titre: 'Titre', slug: 'Slug', description: 'Description de présentation', objectifs: 'Objectifs', programme: 'Programme',
  publicVise: 'Public visé', prerequis: 'Prérequis explicités (ou « Aucun prérequis »)', format: 'Format', dureeMinutes: 'Durée positive', poleId: 'Pôle',
};
function missingFields(data, ids) {
  const missing = Object.entries(publicationRequirements).filter(([key]) => !data[key] || (typeof data[key] === 'string' && !data[key].trim()))
    .map(([field, label]) => ({ field, label, message: `${label} : requis pour publier.` }));
  if (!ids.length) missing.push({ field: 'formateurIds', label: 'Au moins un formateur', message: 'Associez au moins un formateur pour publier.' });
  return missing;
}
function dto(item) {
  const formateurs = item.formateurs.map(link => link.formateur);
  const formateurIds = formateurs.map(person => person.id);
  return { ...item, tarif: item.tarif === null ? null : item.tarif.toFixed(2), formateurs, formateurIds,
    publication: { missing: missingFields(item, formateurIds) } };
}
function invalid(res, error) {
  const result = {};
  for (const issue of error.issues) if (issue.path[0] && !result[issue.path[0]]) result[issue.path[0]] = issue.message;
  return res.status(422).json({ error: 'Vérifiez les champs de la formation.', fields: result });
}
function failure(code, fieldErrors) { const error = new Error(code); error.code = code; error.fieldErrors = fieldErrors; throw error; }
async function references(tx, data) {
  const errors = {};
  if (data.poleId && !await tx.pole.findUnique({ where: { id: data.poleId }, select: { id: true } })) errors.poleId = 'Ce pôle n’existe plus. Choisissez un autre pôle.';
  if (data.formateurIds.length && await tx.formateur.count({ where: { id: { in: data.formateurIds } } }) !== data.formateurIds.length) errors.formateurIds = 'Un formateur sélectionné n’existe plus. Vérifiez la sélection.';
  if (Object.keys(errors).length) failure('INVALID_REFERENCES', errors);
}
function requireComplete(data, ids) {
  const missing = missingFields(data, ids);
  if (missing.length) failure('INCOMPLETE', Object.fromEntries(missing.map(item => [item.field, item.message])));
}
async function versionedUpdate(tx, current, version, data) {
  if (current.updatedAt.getTime() !== new Date(version).getTime()) failure('CONFLICT');
  // Le compteur temporel progresse même si deux écritures arrivent dans la même milliseconde.
  const updatedAt = new Date(Math.max(Date.now(), current.updatedAt.getTime() + 1));
  const result = await tx.formation.updateMany({ where: { id: current.id, updatedAt: new Date(version) }, data: { ...data, updatedAt } });
  if (result.count !== 1) failure('CONFLICT');
}

export function adminFormations(prisma) {
  const router = Router();
  router.get('/formations/options', async (req, res) => {
    const [poles, formateurs] = await prisma.$transaction([
      prisma.pole.findMany({ select: { id: true, titre: true }, orderBy: [{ titre: 'asc' }, { id: 'asc' }] }),
      prisma.formateur.findMany({ select: { id: true, nom: true }, orderBy: [{ nom: 'asc' }, { id: 'asc' }] }),
    ]);
    res.json({ poles, formateurs });
  });
  router.get('/formations', async (req, res) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return invalid(res, parsed.error);
    const { q, page, poleId, publication } = parsed.data;
    const where = { ...(poleId ? { poleId } : {}), ...(publication ? { publiee: publication === 'publiee' } : {}),
      ...(q ? { OR: ['titre', 'slug', 'resume', 'description'].map(key => ({ [key]: { contains: q, mode: 'insensitive' } })) } : {}) };
    const [items, total] = await prisma.$transaction([
      prisma.formation.findMany({ where, select, orderBy: [{ titre: 'asc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }),
      prisma.formation.count({ where }),
    ], { isolationLevel: 'RepeatableRead' });
    res.json({ items: items.map(dto), total, page, pageSize: 20 });
  });
  router.get('/formations/:id', async (req, res) => {
    const item = await prisma.formation.findUnique({ where: { id: req.params.id }, select });
    if (!item) return res.status(404).json({ error: 'Formation introuvable.' });
    res.json({ item: dto(item) });
  });
  async function write(req, res, action) {
    const schema = action === 'create' ? createSchema : action === 'publication' ? publicationSchema : updateSchema;
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return invalid(res, parsed.error);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const item = await prisma.$transaction(async tx => {
          const input = parsed.data;
          let current;
          if (action !== 'create') {
            current = await tx.formation.findUnique({ where: { id: req.params.id }, select });
            if (!current) failure('NOT_FOUND');
            if (current.updatedAt.getTime() !== new Date(input.updatedAt).getTime()) failure('CONFLICT');
          }
          if (action === 'publication') {
            if (input.publiee) {
              const ids = current.formateurs.map(link => link.formateur.id);
              requireComplete(current, ids); await references(tx, { poleId: current.poleId, formateurIds: ids });
            }
            await versionedUpdate(tx, current, input.updatedAt, { publiee: input.publiee });
            return tx.formation.findUnique({ where: { id: current.id }, select });
          }
          await references(tx, input);
          if (current?.publiee) requireComplete(input, input.formateurIds);
          const { formateurIds, updatedAt, ...data } = input;
          data.tarif = data.tarif === null ? null : new Prisma.Decimal(data.tarif);
          let id;
          if (action === 'create') {
            const created = await tx.formation.create({ data: { ...data, publiee: false }, select: { id: true } }); id = created.id;
          } else {
            await versionedUpdate(tx, current, updatedAt, data); id = current.id;
            await tx.formationFormateur.deleteMany({ where: { formationId: id } });
          }
          if (formateurIds.length) await tx.formationFormateur.createMany({ data: formateurIds.map(formateurId => ({ formationId: id, formateurId })) });
          return tx.formation.findUnique({ where: { id }, select });
        }, { isolationLevel: 'Serializable' });
        return res.status(action === 'create' ? 201 : 200).json({ item: dto(item) });
      } catch (error) {
        error = normaliserConflitTransaction(error);
        if (error.code === 'P2034' && attempt < 2) continue;
        if (error.code === 'CONFLICT' || error.code === 'P2034') return res.status(409).json({ code: 'CONFLICT', error: 'Cette formation a été modifiée ailleurs. Votre saisie est conservée. Rechargez la fiche avant de réessayer.' });
        if (error.code === 'NOT_FOUND' || error.code === 'P2025') return res.status(404).json({ error: 'Formation introuvable.' });
        if (error.code === 'P2002') return res.status(409).json({ error: 'Ce slug est déjà utilisé.', fields: { slug: 'Choisissez un slug unique.' } });
        if (error.code === 'INVALID_REFERENCES' || error.code === 'INCOMPLETE') return res.status(422).json({ error: error.code === 'INCOMPLETE' ? 'Complétez la fiche avant de la publier. Pour retirer un élément obligatoire d’une fiche publiée, dépubliez-la d’abord.' : 'Vérifiez les associations.', fields: error.fieldErrors });
        if (error.code === 'P2003') return res.status(422).json({ error: 'Une référence a changé. Vérifiez le pôle et les formateurs.' });
        throw error;
      }
    }
  }
  router.post('/formations', (req, res) => write(req, res, 'create'));
  router.put('/formations/:id', (req, res) => write(req, res, 'update'));
  router.post('/formations/:id/publication', (req, res) => write(req, res, 'publication'));
  router.all(['/formations', '/formations/:id', '/formations/:id/publication'], (req, res) => res.status(405).json({ error: 'Action non disponible. Aucune suppression de formation.' }));
  return router;
}
