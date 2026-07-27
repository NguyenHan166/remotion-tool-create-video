import { config as loadEnvironment } from 'dotenv';
import { defineConfig } from 'prisma/config';
import { fileURLToPath } from 'node:url';

loadEnvironment({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
  quiet: true,
});

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  ...(databaseUrl === undefined ? {} : { datasource: { url: databaseUrl } }),
});
