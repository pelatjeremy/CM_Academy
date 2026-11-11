import { PrismaPg } from '@prisma/adapter-pg';

export function createPrismaAdapter(connectionString) {
  return new PrismaPg({
    connectionString,
    connectionTimeoutMillis: 5000,
    // L'adaptateur sérialise les dates en UTC sans suffixe de fuseau.
    // Fixer chaque connexion évite leur réinterprétation dans le fuseau serveur.
    options: '-c timezone=UTC',
  });
}
