import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db/client.js';

const { db, close } = openDatabase();
const serveClient = process.env.NODE_ENV === 'production';
const app = createApp(db, { clientDist: serveClient ? config.clientDist : undefined });

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
