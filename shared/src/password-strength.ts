import { ZxcvbnFactory } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import * as en from '@zxcvbn-ts/language-en';
import { MAX_PASSWORD, MIN_PASSWORD } from './users.js';

/**
 * Password strength, the same on the server (which enforces it) and in the browser (which shows
 * it as you type). Its own entry point (`@hunt/shared/password-strength`): the dictionaries are
 * large, so the client loads them only on the screens that set a password.
 *
 * Following NIST SP 800-63B: a minimum length and a check against common and guessable
 * passwords, not rules about kinds of characters.
 */

/** zxcvbn's 0–4 score; 3 is "safely unguessable: moderate protection from offline attacks". */
export const MIN_SCORE = 3;

let factory: ZxcvbnFactory | null = null;

function zxcvbn(): ZxcvbnFactory {
  factory ??= new ZxcvbnFactory({
    dictionary: { ...common.dictionary, ...en.dictionary },
    graphs: common.adjacencyGraphs,
    translations: en.translations,
  });
  return factory;
}

export interface PasswordCheck {
  ok: boolean;
  /** 0 (guessable in moments) to 4. */
  score: number;
  /** Why it's refused; empty when ok. */
  problems: string[];
  /** zxcvbn's hints for a better one. */
  suggestions: string[];
}

export interface PasswordOwner {
  firstName: string;
  lastName: string;
  username?: string;
}

function letters(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function checkPassword(password: string, owner: PasswordOwner): PasswordCheck {
  const problems: string[] = [];
  if (password.length < MIN_PASSWORD) problems.push(`Use at least ${MIN_PASSWORD} characters.`);
  if (password.length > MAX_PASSWORD) problems.push(`Use at most ${MAX_PASSWORD} characters.`);

  const plain = letters(password);
  const names = [owner.firstName, owner.lastName, ...(owner.username ?? '').split('.')]
    .map(letters)
    .filter((n) => n.length >= 3);
  if (names.some((n) => plain.includes(n))) problems.push('Don’t use your name or username.');

  const inputs = [...names, 'nevada', 'hunt', 'treasure', 'medallion'];
  const result = zxcvbn().check(password.slice(0, MAX_PASSWORD), inputs);
  if (result.score < MIN_SCORE && password.length >= MIN_PASSWORD) {
    problems.push(result.feedback.warning ?? 'Too easy to guess. Try a longer, less common one.');
  }
  return {
    ok: problems.length === 0,
    score: result.score,
    problems,
    suggestions: result.feedback.suggestions,
  };
}
