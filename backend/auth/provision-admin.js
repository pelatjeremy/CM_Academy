import { emailSchema, newPasswordSchema, hashPassword } from './passwords.js';

// Réservé au script local ; aucune route HTTP n'appelle cette fonction.
export async function createFirstAdmin(prisma, emailInput, passwordInput) {
  const email = emailSchema.parse(emailInput);
  const secret = newPasswordSchema.parse(passwordInput);
  const motDePasseHash = await hashPassword(secret);
  return prisma.$transaction(
    async (tx) => {
      if (await tx.utilisateur.count({ where: { role: 'ADMIN' } }))
        throw new Error('ADMIN_EXISTS');
      return tx.utilisateur.create({
        data: { email, motDePasseHash, role: 'ADMIN', actif: true },
        select: { id: true, email: true, role: true },
      });
    },
    { isolationLevel: 'Serializable' }
  );
}
