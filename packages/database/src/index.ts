import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

export { Prisma, PrismaClient } from '../generated/prisma/client.js';

export function createPrismaClient(databaseUrl: string): PrismaClient {
  const adapter = new PrismaPg(databaseUrl);

  return new PrismaClient({ adapter });
}
