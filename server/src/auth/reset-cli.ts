/**
 * npm run auth:reset -- --user <username>: gives a user a new temporary password, printed here.
 * Run on the server itself; it's how the super admin gets back in after losing their password.
 */
import { parseArgs } from 'node:util';
import { eq } from 'drizzle-orm';
import { config } from '../config.js';
import { openDatabase } from '../db/client.js';
import { users } from '../db/schema.js';
import { resetToTemporary } from './accounts.js';
import { audit } from './limits.js';

const { values } = parseArgs({ options: { user: { type: 'string' } } });
const username = values.user?.trim().toLowerCase();
if (!username) {
  console.error('Usage: npm run auth:reset -- --user firstname.lastname');
  process.exit(1);
}

const { db, close } = openDatabase();
try {
  const row = db.select().from(users).where(eq(users.username, username)).get();
  if (!row || row.removedAt) {
    console.error(`No user "${username}" in ${config.databasePath}.`);
    process.exitCode = 1;
  } else {
    const temp = await resetToTemporary(db, row.id);
    audit(db, null, 'password-reset', row.id, 'from the server console');
    console.log(`\nTemporary password for ${row.username}: ${temp.password}`);
    console.log(
      `It works until ${new Date(temp.expiresAt).toLocaleString()}, and must be changed at sign-in.`,
    );
    if (row.disabledAt) console.log('Note: this account is disabled; re-enable it to sign in.');
  }
} finally {
  close();
}
