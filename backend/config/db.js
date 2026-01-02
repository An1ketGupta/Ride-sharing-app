import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const { PrismaClient } = require('@prisma/client');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');

import dotenv from 'dotenv';

dotenv.config();

// Create PostgreSQL connection pool for Prisma adapter
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Create Prisma adapter
const adapter = new PrismaPg(pool);

// Create Prisma client instance with adapter
const prisma = new PrismaClient({
  adapter: adapter,
  log: ['error'], // Only log errors, no query logs
});

// Test connection
const testConnection = async () => {
  try {
    await prisma.$connect();
    console.log('✅ PostgreSQL (Neon) Connected Successfully!');
  } catch (error) {
    console.error('❌ PostgreSQL Connection Error:', error.message);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export { prisma, testConnection };
