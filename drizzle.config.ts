import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.OT212_DB_PATH ?? './opentrading212.dev.db'
  }
})
