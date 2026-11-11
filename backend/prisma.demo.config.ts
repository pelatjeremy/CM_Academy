import {defineConfig,env} from 'prisma/config';
// Deliberately does not load backend/.env or a development shadow database.
export default defineConfig({schema:'prisma/schema.prisma',migrations:{path:'prisma/migrations'},datasource:{url:env('DATABASE_URL')}});
