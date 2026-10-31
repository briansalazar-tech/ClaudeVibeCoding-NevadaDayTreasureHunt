import { defineConfig } from 'drizzle-kit';

// Migrations are generated from the schema with `npm run db:generate --workspace server`
// and committed; the server applies them on startup (and `npm run db:migrate` does it on demand).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
