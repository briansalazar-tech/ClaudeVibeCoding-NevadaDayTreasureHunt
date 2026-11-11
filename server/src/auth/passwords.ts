import { randomBytes, randomInt, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

/**
 * Password hashing with scrypt (Node's built-in), at OWASP's recommended cost: N=2^15, r=8, p=3
 * (32 MB per hash). The parameters are stored with each hash, so the cost can rise later
 * without breaking old ones.
 */

interface Cost {
  N: number;
  r: number;
  p: number;
}

const DEFAULT_COST: Cost = { N: 2 ** 15, r: 8, p: 3 };
let cost: Cost = DEFAULT_COST;

/** Tests hash many passwords; a low cost keeps them fast. Never call this in the app. */
export function lowerPasswordCostForTests(): void {
  cost = { N: 2 ** 10, r: 8, p: 1 };
}

const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, c: Cost): Promise<Buffer> {
  // Memory is 128 * N * r bytes; allow twice that.
  const options: ScryptOptions = { N: c.N, r: c.r, p: c.p, maxmem: 256 * c.N * c.r };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** `scrypt$N$r$p$salt$hash`, salt and hash in base64. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, cost);
  return ['scrypt', cost.N, cost.r, cost.p, salt.toString('base64'), key.toString('base64')].join(
    '$',
  );
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, N, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await derive(password, Buffer.from(salt, 'base64'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

let dummy: Promise<string> | null = null;

/**
 * Takes as long as checking a real password, for a username that doesn't exist, so the time a
 * sign-in takes doesn't reveal which usernames do.
 */
export async function verifyNothing(password: string): Promise<void> {
  dummy ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(password, await dummy);
}

// No 0/O, 1/l/I: temporary passwords are read off a screen and typed in.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChars(n: number, alphabet = ALPHABET): string {
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}

/** Four groups of four (about 93 bits), e.g. `Kp7w-Rt3x-Mz9q-Hc4v`. */
export function temporaryPassword(): string {
  return [0, 1, 2, 3].map(() => randomChars(4)).join('-');
}

/** The first-run setup code, e.g. `K7QF-9M2D-XC4P`, printed to the server console. */
export function setupCode(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return [0, 1, 2].map(() => randomChars(4, upper)).join('-');
}

/** Compares two codes in constant time, ignoring case, spaces and dashes. */
export function sameCode(a: string, b: string): boolean {
  const clean = (s: string) => Buffer.from(s.toUpperCase().replace(/[\s-]/g, ''));
  const x = clean(a);
  const y = clean(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
