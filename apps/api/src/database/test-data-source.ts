import { PrismaClient } from '@prisma/client';

// Test database connection for testing purposes
export const TestDataSource = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL || process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/test'
    }
  }
});
