import type { Comment, CommentTarget } from '@hunt/shared';
import { useState } from 'react';
import { useAuthorName, useCanEdit } from '../account/context';
import { useComments, useDeleteComment, useSaveComment } from './api';
import { Editor } from './Editor';
import { Markdown } from './Markdown';

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

/** Who added something and when: "Sam Owner · 11/9/2026". */
export function Byline({ by, at, edited }: { by: number | null; at: string; edited?: string }) {
  const name = useAuthorName(by);
  return (
    <span className="byline">
      {name && `${name} · `}
      {shortDate(at)}
      {edited && edited.slice(0, 10) !== at.slice(0, 10) && ` (edited ${shortDate(edited)})`}
    </span>
  );
}

/**
 * Comments on a page or a place note. Anyone can comment; a comment changes only by its
 * author's hand or an admin's.
 */
export function Comments({
  targetKind,
  targetId,
  compact = false,
  startAdding = false,
}: {
  targetKind: CommentTarget;
  targetId: number;
  compact?: boolean;
  /** Open with the comment box ready (opened from "Comment" on a note with none yet). */
  startAdding?: boolean;
}) {
  const comments = useComments(targetKind, targetId);
  const [adding, setAdding] = useState(startAdding);
  const list = comments.data ?? [];
  return (
    <div className={compact ? 'nb-comments compact' : 'nb-comments'}>
      {comments.isError && <p className="form-error">{comments.error.message}</p>}
      {!compact && comments.isSuccess && !list.length && !adding && (
        <p className="muted">No comments yet.</p>
      )}
      <ul className="nb-comment-list">
        {list.map((c) => (
          <CommentItem key={c.id} comment={c} />
        ))}
      </ul>
      {adding ? (
        <CommentForm targetKind={targetKind} targetId={targetId} onDone={() => setAdding(false)} />
      ) : (
        <button type="button" className="small-button" onClick={() => setAdding(true)}>
          + Comment
        </button>
      )}
    </div>
  );
}

function CommentItem({ comment }: { comment: Comment }) {
  const canEdit = useCanEdit(comment.createdBy);
  const remove = useDeleteComment();
  const [editing, setEditing] = useState(false);
  if (editing)
    return (
      <li>
        <CommentForm
          targetKind={comment.targetKind}
          targetId={comment.targetId}
          comment={comment}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  return (
    <li className="nb-comment">
      <Markdown body={comment.body} />
      <span className="nb-comment-meta">
        <Byline by={comment.createdBy} at={comment.createdAt} edited={comment.updatedAt} />
        {canEdit && (
          <>
            <button type="button" className="link-button" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="link-button"
              disabled={remove.isPending}
              onClick={() => remove.mutate(comment.id)}
            >
              Delete
            </button>
          </>
        )}
      </span>
      {remove.isError && <p className="form-error">{remove.error.message}</p>}
    </li>
  );
}

function CommentForm({
  targetKind,
  targetId,
  comment,
  onDone,
}: {
  targetKind: CommentTarget;
  targetId: number;
  comment?: Comment;
  onDone: () => void;
}) {
  const save = useSaveComment();
  const [body, setBody] = useState(comment?.body ?? '');
  return (
    <form
      className="nb-comment-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          { id: comment?.id ?? null, input: { targetKind, targetId, body } },
          { onSuccess: onDone },
        );
      }}
    >
      <Editor
        label="Comment"
        value={body}
        onChange={setBody}
        onDone={onDone}
        rows={2}
        autoFocus
        placeholder="Add a comment. [[Links]] count as references."
      />
      {save.isError && <p className="form-error">{save.error.message}</p>}
      <div className="nb-row">
        <button type="submit" className="small-button primary" disabled={save.isPending}>
          {comment ? 'Save' : 'Comment'}
        </button>
        <button type="button" className="small-button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}
