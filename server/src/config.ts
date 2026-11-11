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

/** TRUST_PROXY: empty is off; true/false; a number of hops; or addresses/subnets for Express. */
function trustProxySetting(value: string | undefined): string | boolean | number {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  return /^\d+$/.test(value) ? Number(value) : value;
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
  /** The processed map data; the geocoder reads the county boundaries from it. */
  mapDataDir: fromRoot(process.env.MAP_DATA_DIR || path.join('client', 'public', 'data')),
  /** The address users open; used for the same-origin check. Optional on your own PC. */
  appUrl: process.env.APP_URL || undefined,
  /** Express's `trust proxy`: set it when a hosting proxy terminates HTTPS in front. */
  trustProxy: trustProxySetting(process.env.TRUST_PROXY),
  /** A fixed first-run setup code (for hosts without a console); otherwise one is generated. */
  setupCode: process.env.SETUP_CODE || undefined,
  geocoder: {
    userAgent: process.env.GEOCODER_USER_AGENT || 'NevadaDayHuntMap/0.1 (personal, non-commercial)',
    nominatimUrl: process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search',
    censusUrl:
      process.env.CENSUS_GEOCODER_URL ||
      'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress',
  },
};
