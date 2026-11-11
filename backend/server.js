import prisma from './lib/prisma.js';
import { createApp } from './app.js';

try {
  const production = process.env.NODE_ENV === 'production';
  const origins =
    process.env.APP_ORIGINS?.split(',')
      .map((value) => value.trim())
      .filter(Boolean) ||
    (production ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']);
  const { app, close } = await createApp({
    prisma,
    production,
    origins,
    connectionString: process.env.DATABASE_URL,
    sessionSecret: process.env.SESSION_SECRET,
    trustedProxy: process.env.TRUSTED_PROXY || false,
  });
  const port = Number(process.env.PORT || 3001);
  const server = app.listen(port, () =>
    console.log('API CMH Academy : http://localhost:' + server.address().port)
  );
  const stop = () =>
    server.close(async () => {
      await close();
      await prisma.$disconnect();
      process.exit(0);
    });
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
} catch {
  console.error(
    'Démarrage impossible : vérifier la configuration du backend et les migrations.'
  );
  await prisma.$disconnect();
  process.exitCode = 1;
}
