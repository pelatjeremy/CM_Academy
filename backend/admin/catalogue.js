import { Router } from 'express';
import {normaliserConflitTransaction} from '../lib/preinscriptions.js';
import { z } from 'zod';

const text = (label, max) => z.string({ error: `${label} doit être un texte.` }).trim().min(1, `${label} est obligatoire.`).max(max, `${max} caractères maximum.`);
const poleSchema = z.object({
  titre: text('Le titre', 160),
  slug: text('Le slug', 160).regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Utilisez des minuscules, chiffres et tirets simples.'),
  description: z.string({ error: 'La description doit être un texte.' }).trim().max(3000, '3 000 caractères maximum.').default(''),
}).strict();
const formateurSchema = z.object({
  nom: text('Le nom', 160),
  biographie: z.string({ error: 'La biographie doit être un texte.' }).trim().max(3000, '3 000 caractères maximum.').default(''),
}).strict();
const querySchema = z.object({ q: z.string().trim().max(100, 'Recherche limitée à 100 caractères.').default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1) }).strict();
const resources = {
  poles: { delegate: 'pole', schema: poleSchema, label: 'Pôle', order: 'titre', search: ['titre', 'slug', 'description'],
    select: { id: true, titre: true, slug: true, description: true, updatedAt: true } },
  formateurs: { delegate: 'formateur', schema: formateurSchema, label: 'Formateur', order: 'nom', search: ['nom', 'biographie'],
    select: { id: true, nom: true, biographie: true, updatedAt: true } },
};
function validation(res, error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return res.status(422).json({ error: 'Vérifiez les champs du formulaire.', fields });
}

export function adminCatalogue(prisma) {
  const router = Router();
  for (const [route, config] of Object.entries(resources)) {
    const delegate = prisma[config.delegate];
    router.get(`/${route}`, async (req, res) => {
      const parsed = querySchema.safeParse(req.query);
      if (!parsed.success) return validation(res, parsed.error);
      const { q, page } = parsed.data;
      const where = q ? { OR: config.search.map(field => ({ [field]: { contains: q, mode: 'insensitive' } })) } : {};
      const [items, total] = await prisma.$transaction([
        delegate.findMany({ where, select: config.select, orderBy: [{ [config.order]: 'asc' }, { id: 'asc' }], skip: (page - 1) * 20, take: 20 }),
        delegate.count({ where }),
      ]);
      res.json({ items, total, page, pageSize: 20 });
    });
    router.get(`/${route}/:id`, async (req, res) => {
      const item = await delegate.findUnique({ where: { id: req.params.id }, select: config.select });
      if (!item) return res.status(404).json({ error: `${config.label} introuvable.` });
      res.json({ item });
    });
    async function save(req, res) {
      const parsed = config.schema.safeParse(req.body);
      if (!parsed.success) return validation(res, parsed.error);
      const id = req.params.id;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const item = await prisma.$transaction(async tx => {
            if (id && !await tx[config.delegate].findUnique({ where: { id }, select: { id: true } })) {
              const error = new Error(); error.code = 'P2025'; throw error;
            }
            if (route === 'formateurs') {
              const duplicate = await tx.formateur.findFirst({ where: {
                nom: { equals: parsed.data.nom, mode: 'insensitive' }, biographie: parsed.data.biographie,
                ...(id ? { id: { not: id } } : {}),
              }, select: { id: true } });
              if (duplicate) { const error = new Error(); error.code = 'DUPLICATE_TRAINER'; throw error; }
            }
            return id ? tx[config.delegate].update({ where: { id }, data: parsed.data, select: config.select })
              : tx[config.delegate].create({ data: parsed.data, select: config.select });
          }, { isolationLevel: 'Serializable' });
          return res.status(id ? 200 : 201).json({ item });
        } catch (error) {
          error = normaliserConflitTransaction(error);
          if (error.code === 'P2034' && attempt < 2) continue;
          if (error.code === 'P2025') return res.status(404).json({ error: `${config.label} introuvable.` });
          if (error.code === 'P2002') return res.status(409).json({ error: 'Ce slug est déjà utilisé.', fields: { slug: 'Choisissez un autre slug.' } });
          if (error.code === 'DUPLICATE_TRAINER') return res.status(409).json({ error: 'Cette fiche formateur existe déjà.', fields: { nom: 'Un formateur possède déjà ce nom et cette biographie.' } });
          if (error.code === 'P2034') return res.status(503).json({ error: 'Une modification est en cours. Réessayez dans quelques instants.' });
          throw error;
        }
      }
    }
    router.post(`/${route}`, save);
    router.put(`/${route}/:id`, save);
    router.all(`/${route}`, (req, res) => res.set('Allow', 'GET, HEAD, POST').status(405).json({ error: 'Action non disponible.' }));
    router.all(`/${route}/:id`, (req, res) => res.set('Allow', 'GET, HEAD, PUT').status(405).json({ error: 'Action non disponible.' }));
  }
  return router;
}
