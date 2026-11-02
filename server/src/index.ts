import path from 'node:path';
import { DATA_FILES } from '@hunt/shared';
import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db/client.js';
import { Geocoder, readCountyAreas } from './geocoder.js';

const { db, close } = openDatabase();
const serveClient = process.env.NODE_ENV === 'production';

function makeGeocoder(): Geocoder | undefined {
  const file = path.join(config.mapDataDir, DATA_FILES.counties);
  try {
    return new Geocoder({ ...config.geocoder, areas: readCountyAreas(file) });
  } catch (err) {
    console.warn(`Address search is off: couldn't read ${file} (${(err as Error).message})`);
    return undefined;
  }
}

const app = createApp(db, {
  clientDist: serveClient ? config.clientDist : undefined,
  geocoder: makeGeocoder(),
});

const server = app.listen(config.port, config.host, () => {
  console.log(
    `Hunt map server on http://${config.host}:${config.port} (database ${config.databasePath})`,
  );
});

function shutdown() {
  server.close(() => {
    close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
