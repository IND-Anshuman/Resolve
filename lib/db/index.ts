import { neon } from '@neondatabase/serverless';
import { drizzle, type NeonHttpDatabase } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export { schema };

let instance: NeonHttpDatabase<typeof schema> | undefined;

// Created on first use so that importing this module (e.g. during `next build`) does not
// require DATABASE_URL.
export function db(): NeonHttpDatabase<typeof schema> {
  if (instance) return instance;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL must be set (see .env.example)');
  instance = drizzle(neon(url), { schema });
  return instance;
}
