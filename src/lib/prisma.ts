import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Check whether DATABASE_URL is accessible or dummy
const isDummyDb =
  !process.env.DATABASE_URL ||
  process.env.DATABASE_URL.includes('ep-example-123456');

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
