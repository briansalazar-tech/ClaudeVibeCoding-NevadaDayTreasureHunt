/** npm run db:migrate: applies pending Drizzle migrations to DATABASE_PATH. */
import { config } from '../config.js';
import { openDatabase } from './client.js';

const { close } = openDatabase();
close();
console.log(`Database is up to date: ${config.databasePath}`);
