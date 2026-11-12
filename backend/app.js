import {suiviDocuments} from './suivi-documents.js';
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
import {createVideoStorage} from './lib/videos.js';
import {adminVideos,videosStagiaire} from './videos-pedagogiques.js';
import {serveFrontend} from './lib/frontend.js';
import {demoStatus} from './admin/demo-status.js';

export async function createApp(options) {
  const { prisma } = options;
  const app = express();
  app.disable('x-powered-by');
  app.get('/api/configuration-publique',(req,res)=>res.set('Cache-Control','no-store').json({demonstration:options.demo===true}));
  if (options.trustedProxy) app.set('trust proxy', options.trustedProxy);
  if(options.production)app.use((req,res,next)=>{res.set({'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self' blob:; frame-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",'Referrer-Policy':'same-origin','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY'});next();});
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
  if(options.demo)app.post('/api/sessions/:id/preinscriptions',(req,res)=>res.status(403).json({error:'Les nouvelles demandes sont fermées sur la démonstration. Ne saisissez aucune donnée personnelle.'}));
  app.use('/api', publicPreinscriptions(prisma, options.clock));
  const auth = await configureAuth(app, options);
  if(options.demo)app.use('/api/admin',demoStatus(prisma,createDocumentStorage(options.documentStorage)));
  const videoStorage=createVideoStorage({root:options.documentStorage?.root,...options.videoStorage});
  app.use('/api/admin', adminVideos(prisma,videoStorage));
  app.use('/api/stagiaire', videosStagiaire(prisma,videoStorage));
  app.use('/api/admin', adminPedagogie(prisma, createDocumentStorage({...options.documentStorage,mimeTypes:['application/pdf']}),videoStorage.maxFileBytes));
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
  app.use('/api/admin', suiviDocuments(prisma, createDocumentStorage(options.documentStorage)));
  app.use('/api/stagiaire', suiviDocuments(prisma, createDocumentStorage(options.documentStorage), {stagiaire:true}));
  app.use('/api/stagiaire', adminFichiers(prisma, createDocumentStorage(options.documentStorage), {stagiaire:true}));
  app.use('/api/admin', adminCatalogue(prisma));
  app.use('/api/admin', adminFormations(prisma));
  app.use('/api/admin', adminSessions(prisma));
  app.use('/api/admin', adminInscriptions(prisma));
  app.use('/api/admin', adminDossiers(prisma));
  app.use(
    '/api/admin',
    adminFichiers(prisma, createDocumentStorage(options.documentStorage))
  );
  if(options.frontendDir)serveFrontend(app,options.frontendDir);
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
