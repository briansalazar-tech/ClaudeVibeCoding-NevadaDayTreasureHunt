import { mkdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

/** `hunt-2026-11-02-1405.db` for a copy made at 14:05 local time (plus an optional note). */
function copyName(source: string, at: Date, note?: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}`;
  const base = path.basename(source, path.extname(source));
  return `${base}-${stamp}${note ? `-${note}` : ''}.db`;
}

/**
 * Copies an open database into `dir` with SQLite's online backup, which is consistent (WAL
 * contents included) while the server keeps running. Returns the copy's path.
 */
export async function copyDatabase(
  source: Database.Database,
  dir: string,
  note?: string,
): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, copyName(source.name, new Date(), note));
  await source.backup(target);
  // The copy keeps the live database's WAL mode; switch it back so it's a single file.
  const copy = new Database(target);
  copy.pragma('journal_mode = DELETE');
  copy.close();
  return target;
}
