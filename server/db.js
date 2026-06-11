import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.warn('⚠️  DATABASE_URL is not set — database calls will fail. Copy .env.example to .env and fill it in.');
}

// Neon HTTP driver: each `sql` call is a single stateless query, which is all
// the Render free tier needs (no long-lived connections).
export const sql = process.env.DATABASE_URL
  ? neon(process.env.DATABASE_URL)
  : () => { throw new Error('DATABASE_URL is not configured'); };
