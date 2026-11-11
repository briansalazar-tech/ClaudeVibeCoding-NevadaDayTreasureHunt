import { canEditContent, type CurrentUser } from '@hunt/shared';
import { HttpError } from '../errors.js';

/** Pages, notes, comments, photos and markers change only by their author's hand or an admin's. */
export function assertCanEdit(user: CurrentUser, createdBy: number | null, what: string): void {
  if (!canEditContent(user, createdBy))
    throw new HttpError(403, `Only the ${what}’s author or an admin can change it`, {
      code: 'not-author',
    });
}
