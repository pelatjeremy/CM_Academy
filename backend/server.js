import prisma from './lib/prisma.js';
import { createApp } from './app.js';
import {videoProbeStatus} from './lib/videos.js';
import {fileURLToPath} from 'node:url';
import {demoTarget} from './lib/demo-target.js';

try {
  const production = process.env.NODE_ENV === 'production';
  if(process.env.DEMO_MODE==='true')demoTarget();
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
    trustedProxy: /^\d+$/.test(process.env.TRUSTED_PROXY||'')?Number(process.env.TRUSTED_PROXY):process.env.TRUSTED_PROXY||false,
    demo:process.env.DEMO_MODE==='true',
    frontendDir:process.env.SERVE_FRONTEND==='true'?fileURLToPath(new URL('../frontend/dist/',import.meta.url)):undefined,
  });
  const port = Number(process.env.PORT || 3001);
  const probe=await videoProbeStatus();
  if(probe.available)console.log('Vidéos : ffprobe '+probe.version+' disponible.');
  else console.warn(probe.error);
  const server = app.listen(port,process.env.BIND_HOST||'0.0.0.0', () =>
    console.log('API CMH Academy : http://localhost:' + server.address().port)
  );
  server.requestTimeout=30*60*1000;
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
