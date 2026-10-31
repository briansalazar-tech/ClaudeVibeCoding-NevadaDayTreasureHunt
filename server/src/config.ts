import { existsSync } from 'node:fs';
import path from 'node:path';

/** The server package directory, found from this file whether it runs from src/ (tsx) or dist/ (bundle). */
function findServerDir(): string {
  let dir = import.meta.dirname;
  for (let i = 0; i < 4; i++) {
    if (existsSync(path.join(dir, 'drizzle')) && existsSync(path.join(dir, 'package.json')))
      return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`Couldn't find the server directory from ${import.meta.dirname}`);
}

export const SERVER_DIR = findServerDir();
export const REPO_ROOT = path.dirname(SERVER_DIR);

// .env lives at the repo root, shared with the client.
const envFile = path.join(REPO_ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

function fromRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.join(REPO_ROOT, p);
}

export const config = {
  port: Number(process.env.PORT) || 3001,
  /** Where to listen. Set HOST=0.0.0.0 to reach the server from other devices. */
  host: process.env.HOST || 'localhost',
  databasePath: fromRoot(process.env.DATABASE_PATH || path.join('server', 'data', 'hunt.db')),
  uploadsDir: fromRoot(process.env.UPLOADS_DIR || path.join('server', 'data', 'uploads')),
  migrationsDir: path.join(SERVER_DIR, 'drizzle'),
  /** The built client, served by the API server in production if it exists. */
  clientDist: path.join(REPO_ROOT, 'client', 'dist'),
};
