import { input, password } from '@inquirer/prompts';
import prisma from '../lib/prisma.js';
import { emailSchema, newPasswordSchema } from '../auth/passwords.js';
import { createFirstAdmin } from '../auth/provision-admin.js';
try {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error('INTERACTIVE');
  const url = new URL(process.env.DATABASE_URL);
  if (!['localhost','127.0.0.1','[::1]'].includes(url.hostname) || decodeURIComponent(url.pathname.slice(1)) !== 'cmh_academy_dev') throw new Error('DESTINATION');
  const [identity] = await prisma.$queryRaw`SELECT current_database() AS db, host(inet_server_addr()) AS host`;
  if (identity.db !== 'cmh_academy_dev' || !['127.0.0.1','::1'].includes(identity.host)) throw new Error('DESTINATION');
  if (await prisma.utilisateur.count({ where: { role: 'ADMIN' } })) console.log('Un administrateur existe déjà. Aucune modification effectuée.');
  else {
    const email = emailSchema.parse(await input({ message: 'Adresse email :', validate: value => emailSchema.safeParse(value).success || 'Adresse email invalide.' }));
    const secret = await password({ message: 'Mot de passe (12 à 128 caractères) :', mask: '*', validate: value => newPasswordSchema.safeParse(value).success || 'Utilisez entre 12 et 128 caractères.' });
    const confirmation = await password({ message: 'Confirmez le mot de passe :', mask: '*' });
    if (secret !== confirmation) throw new Error('CONFIRMATION');
    await createFirstAdmin(prisma, email, secret);
    console.log('Administrateur créé. Vous pouvez vous connecter.');
  }
} catch {
  console.error('Création annulée ou impossible. Vérifiez la saisie, la destination locale et l’absence de compte existant. Aucun secret affiché.'); process.exitCode = 1;
} finally { await prisma.$disconnect(); }
