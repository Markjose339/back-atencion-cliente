import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './src/**/entities/*.entity.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    prefix: 'timestamp',
    table: 'drizzle_migrations',
    schema: 'public',
  },
  schemaFilter: ['public'],
  strict: true,
  introspect: {
    casing: 'camel',
  },
});
