/**
 * npm run db:backup: copies DATABASE_PATH to a dated file in a backups folder beside it.
 * SQLite's online backup gives one consistent file (WAL contents included) even while the
 * server is running.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { config } from '../config.js';

/** `hunt-2026-11-02-1405.db` for a backup taken at 14:05 local time. */
function backupFileName(source: string, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  return `${path.basename(source, path.extname(source))}-${stamp}.db`;
}

const dir = path.join(path.dirname(config.databasePath), 'backups');
mkdirSync(dir, { recursive: true });
const target = path.join(dir, backupFileName(config.databasePath, new Date()));

const source = new Database(config.databasePath, { readonly: true, fileMustExist: true });
await source.backup(target);
source.close();

// The copy keeps the live database's WAL mode; switch it back so the backup is a single file.
const copy = new Database(target);
copy.pragma('journal_mode = DELETE');
const check = copy.pragma('integrity_check', { simple: true }) as string;
const markers = (copy.prepare('SELECT count(*) AS n FROM markers').get() as { n: number }).n;
copy.close();
console.log(
  `Backed up ${config.databasePath}\n  to ${target}\n  integrity ${check}, ${markers} markers`,
);
