import {defineConfig} from 'prisma/config';
// Generating a client at image build time never needs database credentials.
export default defineConfig({schema:'prisma/schema.prisma'});
