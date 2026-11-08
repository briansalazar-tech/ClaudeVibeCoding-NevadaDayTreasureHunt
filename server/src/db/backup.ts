/**
 * npm run db:backup: copies DATABASE_PATH to a dated file in a backups folder beside it.
 * Safe while the server is running (see copyDatabase).
 */
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';
import { copyDatabase } from './copy.js';

const source = new Database(config.databasePath, { readonly: true, fileMustExist: true });
const target = await copyDatabase(source, path.join(path.dirname(config.databasePath), 'backups'));
source.close();

const copy = new Database(target, { readonly: true });
const check = copy.pragma('integrity_check', { simple: true }) as string;
const markers = (copy.prepare('SELECT count(*) AS n FROM markers').get() as { n: number }).n;
copy.close();
console.log(
  `Backed up ${config.databasePath}\n  to ${target}\n  integrity ${check}, ${markers} markers`,
);
