import { activationRoutes } from './activation.js';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import { csrfSync } from 'csrf-sync';
import { rateLimit } from 'express-rate-limit';
import { createHash, randomBytes } from 'node:crypto';
import { Router } from 'express';
import { hashPassword, verifyPassword, loginSchema } from './passwords.js';

const genericLoginError = {
  error:
    'Connexion impossible. Vérifiez vos identifiants ou réessayez plus tard.',
};
const userSelect = { id: true, email: true, role: true };
const sessionDuration = 8 * 60 * 60 * 1000;
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function configureAuth(
  app,
  {
    prisma,
    connectionString,
    sessionSecret,
    origins,
    production = false,
    loginLimits = { ip: 30, email: 8 },
  }
) {
  if (typeof sessionSecret !== 'string' || sessionSecret.length < 32)
    throw new Error('SESSION_SECRET invalide.');
  const allowedOrigins = new Set(origins.map((value) => new URL(value).origin));
  if (
    !allowedOrigins.size ||
    (production &&
      [...allowedOrigins].some((value) => !value.startsWith('https://')))
  )
    throw new Error('Origines invalides.');
  const pool = new pg.Pool({
    connectionString,
    connectionTimeoutMillis: 5000,
    options: '-c timezone=UTC',
  });
  pool.on('error', () => console.error('Stockage des sessions indisponible.'));
  const PgStore = connectPgSimple(session);
  const store = new PgStore({
    pool,
    tableName: 'AuthSession',
    createTableIfMissing: false,
    disableTouch: true,
    pruneSessionInterval: 15 * 60,
    errorLog: () => console.error('Stockage des sessions indisponible.'),
  });
  const cookieName = production ? '__Host-cmh.sid' : 'cmh.sid';
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: production,
  };
  const middleware = session({
    name: cookieName,
    secret: sessionSecret,
    store,
    resave: false,
    saveUninitialized: false,
    rolling: false,
    unset: 'destroy',
    cookie: { ...cookieOptions, maxAge: 10 * 60 * 1000 },
  });
  // Le catalogue public ne dépend pas du stockage de sessions.
  app.use(['/api/auth', '/api/admin', '/api/stagiaire'], (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    middleware(req, res, next);
  });
  const { generateToken, csrfSynchronisedProtection } = csrfSync();
  const protectCsrf = (req, res, next) => {
    if (safeMethods.has(req.method)) return next();
    if (
      !allowedOrigins.has(req.get('origin')) ||
      req.get('sec-fetch-site') === 'cross-site'
    )
      return res
        .status(403)
        .json({ error: 'Requête non autorisée. Actualisez la page.' });
    csrfSynchronisedProtection(req, res, next);
  };
  const destroy = (req) =>
    new Promise((resolve, reject) =>
      req.session.destroy((error) => (error ? reject(error) : resolve()))
    );
  const clearCookie = (res) => res.clearCookie(cookieName, cookieOptions);
  const requireUser = async (req, res, next) => {
    if (!req.session.userId)
      return res.status(401).json({ error: 'Connexion requise.' });
    if (
      !Number.isFinite(req.session.authExpiresAt) ||
      req.session.authExpiresAt <= Date.now()
    ) {
      await destroy(req);
      clearCookie(res);
      return res.status(401).json({ error: 'Connexion requise.' });
    }
    const user = await prisma.utilisateur.findUnique({
      where: { id: req.session.userId },
      select: { ...userSelect, actif: true },
    });
    if (!user?.actif) {
      await destroy(req);
      clearCookie(res);
      return res.status(401).json({ error: 'Connexion requise.' });
    }
    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  };
  const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'ADMIN')
      return res.status(403).json({ error: 'Accès non autorisé.' });
    next();
  };
  const limiterOptions = {
    windowMs: 15 * 60 * 1000,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    handler: (req, res) => res.status(429).json(genericLoginError),
  };
  const ipLimiter = rateLimit({ ...limiterOptions, limit: loginLimits.ip });
  const emailLimiter = rateLimit({
    ...limiterOptions,
    limit: loginLimits.email,
    keyGenerator: (req) =>
      createHash('sha256')
        .update(
          typeof req.body?.email === 'string'
            ? req.body.email.trim().toLowerCase().slice(0, 254)
            : 'invalid'
        )
        .digest('hex'),
  });
  const dummyHash = await hashPassword(randomBytes(32).toString('hex'));
  const auth = Router();
  auth.get('/csrf', (req, res) => res.json({ csrfToken: generateToken(req) }));
  auth.post(
    '/connexion',
    ipLimiter,
    protectCsrf,
    emailLimiter,
    async (req, res) => {
      const parsed = loginSchema.safeParse(req.body);
      const user = parsed.success
        ? await prisma.utilisateur.findUnique({
            where: { email: parsed.data.email },
          })
        : null;
      const valid = await verifyPassword(
        user?.motDePasseHash || dummyHash,
        parsed.success ? parsed.data.password : 'invalid'
      );
      if (!parsed.success || !valid || !user?.actif)
        return res.status(401).json(genericLoginError);
      await new Promise((resolve, reject) =>
        req.session.regenerate((error) => (error ? reject(error) : resolve()))
      );
      req.session.userId = user.id;
      req.session.authExpiresAt = Date.now() + sessionDuration;
      req.session.cookie.maxAge = sessionDuration;
      const csrfToken = generateToken(req, true);
      await new Promise((resolve, reject) =>
        req.session.save((error) => (error ? reject(error) : resolve()))
      );
      res.json({
        user: { id: user.id, email: user.email, role: user.role },
        csrfToken,
      });
    }
  );
  auth.get('/moi', requireUser, (req, res) =>
    res.json({ user: req.user, csrfToken: generateToken(req) })
  );
  auth.post('/deconnexion', requireUser, protectCsrf, async (req, res) => {
    await destroy(req);
    clearCookie(res);
    res.status(204).end();
  });
  auth.use('/invitations', activationRoutes(prisma, protectCsrf));
  app.use('/api/auth', auth);
  app.use(
    '/api/stagiaire',
    requireUser,
    (req, res, next) =>
      req.user.role === 'STAGIAIRE'
        ? next()
        : res.status(403).json({ error: 'Accès réservé aux stagiaires.' }),
    protectCsrf
  );
  app.use('/api/admin', requireUser, requireAdmin, protectCsrf);
  app.get('/api/admin/moi', (req, res) =>
    res.json({ user: req.user, csrfToken: generateToken(req) })
  );
  return {
    close: async () => {
      await store.close();
      await pool.end();
    },
  };
}
