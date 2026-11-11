import { pageTypeName, type PlaceNote, type PlaceRef } from '@hunt/shared';
import { useState } from 'react';
import { useCanEdit } from '../account/context';
import { useHuntStore } from '../state/store';
import { useDeleteNote, useOpenPage, usePlaceNotebook, useSaveNote, useSavePage } from './api';
import { Byline, Comments } from './Comments';
import { useNotebook } from './context';
import { Editor } from './Editor';
import { Inline, Markdown } from './Markdown';
import { PhotoGrid } from './Photos';
import { findEntry, goToPlace } from './places';

/** "In your notebook" in a place's popup: its page, what links to it, notes and photos. */
export function PlaceNotebookSection({ place }: { place: PlaceRef }) {
  const nb = usePlaceNotebook(place);
  const openPage = useHuntStore((s) => s.openPage);
  const open = useOpenPage();
  const { names, countyOf } = useNotebook();
  const [adding, setAdding] = useState(false);
  const data = nb.data;

  return (
    <div className="popup-notebook">
      <span className="popup-label">In your notebook</span>
      {nb.isPending && <p className="muted">Loading…</p>}
      {nb.isError && <p className="form-error">{nb.error.message}</p>}
      {data && (
        <>
          {data.page ? (
            <p>
              <button type="button" className="link-button" onClick={() => openPage(data.page!.id)}>
                {data.page.title}
              </button>{' '}
              <span className="muted">{pageTypeName(data.page.type)}</span>
            </p>
          ) : (
            <button
              type="button"
              className="small-button"
              disabled={open.isPending}
              onClick={() =>
                open.mutate(
                  { title: place.name, type: 'place', place },
                  { onSuccess: (page) => openPage(page.id) },
                )
              }
            >
              + Notebook page for this place
            </button>
          )}
          {data.mentions.length > 0 && (
            <p className="popup-mentions">
              <span className="muted">Mentioned in </span>
              {data.mentions.map((m, i) => (
                <span key={`${m.kind}|${m.id}`}>
                  {i > 0 && ', '}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      if (m.kind === 'page') openPage(m.id);
                      else if (m.pageId) openPage(m.pageId);
                      else if (m.place)
                        goToPlace(m.place, {
                          entry: findEntry(names, m.place),
                          county: countyOf(m.place.lng, m.place.lat),
                        });
                    }}
                  >
                    {m.kind === 'note'
                      ? `note on ${m.title}`
                      : m.kind === 'comment'
                        ? `comment on ${m.title}`
                        : m.title}
                  </button>
                </span>
              ))}
            </p>
          )}
          {data.notes.map((n) => (
            <NoteItem key={n.id} note={n} comments={data.commentCounts[n.id] ?? 0} />
          ))}
          {adding ? (
            <NoteForm place={place} onDone={() => setAdding(false)} />
          ) : (
            <button type="button" className="small-button" onClick={() => setAdding(true)}>
              + Note
            </button>
          )}
          <PhotoGrid photos={data.photos} target={{ place }} compact />
        </>
      )}
    </div>
  );
}

function NoteItem({ note, comments }: { note: PlaceNote; comments: number }) {
  const [editing, setEditing] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const canEdit = useCanEdit(note.createdBy);
  const remove = useDeleteNote();
  if (editing) return <NoteForm place={note.place} note={note} onDone={() => setEditing(false)} />;
  return (
    <div className="popup-note">
      <Markdown body={note.body} />
      <span className="popup-note-actions">
        <span className="muted">
          <Byline by={note.createdBy} at={note.createdAt} edited={note.updatedAt} />
        </span>
        <button
          type="button"
          className="link-button"
          aria-expanded={showComments}
          onClick={() => setShowComments(!showComments)}
        >
          {comments ? `Comments (${comments})` : 'Comment'}
        </button>
        {canEdit && (
          <>
            <button type="button" className="link-button" onClick={() => setEditing(true)}>
              Edit
            </button>
            <button
              type="button"
              className="link-button"
              disabled={remove.isPending}
              onClick={() => remove.mutate(note.id)}
            >
              Delete
            </button>
          </>
        )}
      </span>
      {remove.isError && <p className="form-error">{remove.error.message}</p>}
      {showComments && (
        <Comments targetKind="note" targetId={note.id} compact startAdding={comments === 0} />
      )}
    </div>
  );
}

function NoteForm({
  place,
  note,
  onDone,
}: {
  place: PlaceRef;
  note?: PlaceNote;
  onDone: () => void;
}) {
  const save = useSaveNote();
  const [body, setBody] = useState(note?.body ?? '');
  return (
    <form
      className="popup-note-form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ id: note?.id ?? null, input: { place, body } }, { onSuccess: onDone });
      }}
    >
      <Editor
        label="Note on this place"
        value={body}
        onChange={setBody}
        onDone={onDone}
        rows={3}
        autoFocus
        placeholder="A note on this place. [[Links]] count as references."
      />
      {save.isError && <p className="form-error">{save.error.message}</p>}
      <div className="popup-actions">
        <button type="submit" className="small-button primary" disabled={save.isPending}>
          Save note
        </button>
        <button type="button" className="small-button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** The popup of a page put on the map. */
export function PagePopup({ pageId }: { pageId: number }) {
  const { pages } = useNotebook();
  const openPage = useHuntStore((s) => s.openPage);
  const save = useSavePage();
  const page = pages.find((p) => p.id === pageId);
  const canEdit = useCanEdit(page?.createdBy ?? null);
  if (!page) return <p className="muted">This page is gone.</p>;
  const lines = page.body
    .split('\n')
    .filter((l) => l.trim())
    .slice(0, 3);
  return (
    <div className="popup">
      <h3>{page.title}</h3>
      <p className="popup-sub">Notebook page · {pageTypeName(page.type)}</p>
      {lines.map((l, i) => (
        <p key={i} className="popup-description">
          <Inline text={l} />
        </p>
      ))}
      <div className="popup-actions">
        <button type="button" className="small-button primary" onClick={() => openPage(page.id)}>
          Open page
        </button>
        {canEdit && (
          <button
            type="button"
            className="small-button"
            onClick={() => save.mutate({ id: page.id, patch: { spot: null } })}
          >
            Remove from map
          </button>
        )}
      </div>
      {save.isError && <p className="form-error">{save.error.message}</p>}
    </div>
  );
}
