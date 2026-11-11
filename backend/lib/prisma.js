import { PrismaClient } from '@prisma/client';
import { createPrismaAdapter } from './prisma-adapter.js';

if (!process.env.DATABASE_URL) {
  throw new Error('La variable DATABASE_URL est manquante.');
}

const adapter = createPrismaAdapter(process.env.DATABASE_URL);

const prisma = new PrismaClient({ adapter });

export default prisma;
