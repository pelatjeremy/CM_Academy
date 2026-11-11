import { adminPresences } from './admin/presences.js';
import { adminPedagogie } from './admin/pedagogie.js';
import { pedagogieStagiaire } from './pedagogie-stagiaire.js';
import { adminAttestations } from './admin/attestations.js';
import { presencesStagiaire } from './presences-stagiaire.js';
import { adminQuestionnaires } from './admin/questionnaires.js';
import { questionnairesStagiaire } from './questionnaires-stagiaire.js';
import { adminStagiaires } from './admin/stagiaires.js';
import { espaceStagiaire } from './stagiaire.js';
import express from 'express';
import { configureAuth } from './auth/index.js';
import { adminCatalogue } from './admin/catalogue.js';
import { adminFormations } from './admin/formations.js';
import { adminSessions } from './admin/sessions.js';
import { publicCatalogue } from './public/catalogue.js';
import { publicPreinscriptions } from './public/preinscriptions.js';
import { adminInscriptions } from './admin/inscriptions.js';
import { adminDossiers } from './admin/dossiers.js';
import { adminFichiers } from './admin/fichiers.js';
import { createDocumentStorage } from './lib/documents.js';
import {normaliserConflitTransaction} from './lib/preinscriptions.js';

export async function createApp(options) {
  const { prisma } = options;
  const app = express();
  app.disable('x-powered-by');
  if (options.trustedProxy) app.set('trust proxy', options.trustedProxy);
  app.use(express.json({ limit: '128kb' }));
  app.get('/api/health', (req, res) =>
    res.json({ status: 'ok', message: 'Le serveur CMH Academy fonctionne.' })
  );
  app.get('/api/health/database', async (req, res) => {
    try {
      await prisma.formation.count();
      res.json({ status: 'ok', message: 'Connexion à PostgreSQL établie.' });
    } catch {
      res
        .status(503)
        .json({
          status: 'error',
          message: 'La base de données est inaccessible.',
        });
    }
  });
  app.get('/api/formations', async (req, res) => {
    try {
      const formations = await prisma.formation.findMany({
        where: { publiee: true },
        select: { id: true, titre: true, description: true },
        orderBy: [{ titre: 'asc' }, { id: 'asc' }],
      });
      res.json({ formations });
    } catch {
      res
        .status(503)
        .json({ error: 'Les formations sont momentanément indisponibles.' });
    }
  });
  app.use('/api', publicCatalogue(prisma, options.clock));
  app.use('/api', publicPreinscriptions(prisma, options.clock));
  const auth = await configureAuth(app, options);
  app.use('/api/admin', adminPedagogie(prisma, createDocumentStorage({...options.documentStorage,mimeTypes:['application/pdf']})));
  app.use('/api/stagiaire', pedagogieStagiaire(prisma, createDocumentStorage(options.documentStorage)));
  app.use('/api/admin', adminAttestations(prisma, createDocumentStorage(options.documentStorage), options.attestationPdf, options.clock));
  // Le middleware de session, de rôle et de CSRF est installé avant ce routeur.
  app.use('/api/admin', adminPresences(prisma, options.clock));
  app.use('/api/stagiaire', presencesStagiaire(prisma));
  app.use('/api/admin', adminQuestionnaires(prisma));
  app.use('/api/stagiaire', questionnairesStagiaire(prisma));
  app.use('/api/admin', adminStagiaires(prisma));
  app.use(
    '/api/stagiaire',
    espaceStagiaire(prisma, createDocumentStorage(options.documentStorage))
  );
  app.use('/api/admin', adminCatalogue(prisma));
  app.use('/api/admin', adminFormations(prisma));
  app.use('/api/admin', adminSessions(prisma));
  app.use('/api/admin', adminInscriptions(prisma));
  app.use('/api/admin', adminDossiers(prisma));
  app.use(
    '/api/admin',
    adminFichiers(prisma, createDocumentStorage(options.documentStorage))
  );
  app.use((req, res) => res.status(404).json({ error: 'Route introuvable.' }));
  app.use((error, req, res, next) => {
    error=normaliserConflitTransaction(error);
    if (res.headersSent) return next(error);
    if(error.code==='P2034')return res.status(409).json({code:'CONFLICT',error:'Une modification concurrente a été détectée. Vos saisies sont conservées. Actualisez avant de réessayer.'});
    if (error.code === 'EBADCSRFTOKEN')
      return res
        .status(403)
        .json({ error: 'Requête non autorisée. Actualisez la page.' });
    const status = [400, 413].includes(error.status) ? error.status : 500;
    if (status === 500) console.error('Échec du traitement d’une requête.');
    res
      .status(status)
      .json({
        error:
          status === 500
            ? 'Une erreur est survenue.'
            : 'Les données envoyées sont invalides.',
      });
  });
  return { app, close: auth.close };
}
