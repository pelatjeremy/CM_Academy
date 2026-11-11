import assert from 'node:assert/strict';
import prisma from '../lib/prisma.js';
import {createDocumentStorage} from '../lib/documents.js';

try {
  const destination = new URL(process.env.DATABASE_URL);
  assert(['localhost', '127.0.0.1', '[::1]'].includes(destination.hostname));
  assert.equal(decodeURIComponent(destination.pathname.slice(1)), 'cmh_academy_dev');
  const [identity] = await prisma.$queryRaw`SELECT current_database() AS db, host(inet_server_addr()) AS host`;
  assert.equal(identity.db, 'cmh_academy_dev');
  assert(['127.0.0.1', '::1'].includes(identity.host));
  const cleanTemporary = process.argv.includes('--nettoyer-temporaires');
  if (cleanTemporary) assert(process.argv.includes('--serveur-arrete'), 'Arrêter le backend puis fournir --serveur-arrete.');
  const report = await createDocumentStorage().audit(prisma, {cleanTemporary});
  console.log(JSON.stringify(report, null, 2));
  if (report.manquants.length || report.alteres.length || report.inconnus) process.exitCode = 1;
} catch (error) {
  console.error('Audit interrompu. Vérifier la destination locale, la migration, le stockage et les options. Aucun contenu affiché.');
  if (error.code) console.error('Code technique : ' + error.code);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
