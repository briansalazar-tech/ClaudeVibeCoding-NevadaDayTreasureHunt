import {
  PAGE_TYPES,
  dailyTitle,
  nameKey,
  pageTypeName,
  type Page,
  type PageType,
} from '@hunt/shared';
import { useRef, useState } from 'react';
import { useHuntStore } from '../state/store';
import { BACKUP_URL, EXPORT_URL, useCreatePage, useOpenPage, useRestore } from './api';
import { Capture } from './Capture';
import { useNotebook } from './context';
import { PageView } from './PageView';

/** The Notebook tab: the notebook home, or one page. */
export function Notebook() {
  const { pages, pagesError } = useNotebook();
  const pageId = useHuntStore((s) => s.notebookPage);
  const history = useHuntStore((s) => s.notebookHistory);
  const full = useHuntStore((s) => s.notebookFull);
  const openPage = useHuntStore((s) => s.openPage);
  const pageBack = useHuntStore((s) => s.pageBack);
  const setFull = useHuntStore((s) => s.setNotebookFull);
  const open = useOpenPage();
  const page = pageId === null ? undefined : pages.find((p) => p.id === pageId);

  const today = () =>
    open.mutate(
      { title: dailyTitle(new Date()), type: 'daily' },
      { onSuccess: (p) => openPage(p.id) },
    );

  return (
    <div className="notebook">
      <div className="nb-toolbar">
        {pageId !== null ? (
          <button type="button" className="link-button" onClick={pageBack}>
            ← {history.length ? 'Back' : 'Notebook'}
          </button>
        ) : (
          <h2 className="nb-toolbar-title">Notebook</h2>
        )}
        <span className="nb-row">
          {pageId !== null && (
            <button type="button" className="small-button" onClick={() => openPage(null)}>
              Home
            </button>
          )}
          <button type="button" className="small-button" onClick={today} disabled={open.isPending}>
            Today
          </button>
          <button
            type="button"
            className="small-button nb-view-toggle"
            onClick={() => setFull(!full)}
            aria-pressed={full}
          >
            {full ? 'Map beside' : 'Full view'}
          </button>
        </span>
      </div>
      {pagesError && <p className="form-error">Notebook unavailable: {pagesError.message}</p>}
      {open.isError && <p className="form-error">{open.error.message}</p>}
      {pageId === null ? (
        <NotebookHome />
      ) : page ? (
        <PageView key={page.id} page={page} />
      ) : (
        <p className="muted">Loading the page…</p>
      )}
    </div>
  );
}

function snippet(body: string): string {
  const line = body
    .split('\n')
    .map((l) => l.replace(/^\s*([-*>]|#{1,3})\s+/, '').trim())
    .find(Boolean);
  return (line ?? '')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\*\*/g, '')
    .slice(0, 120);
}

function NotebookHome() {
  const { pages } = useNotebook();
  const openPage = useHuntStore((s) => s.openPage);
  const outlines = useHuntStore((s) => s.notebookOutlines);
  const setOutlines = useHuntStore((s) => s.setNotebookOutlines);
  const [type, setType] = useState<PageType | 'all'>('all');
  const [filter, setFilter] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [creating, setCreating] = useState(false);

  if (capturing) return <Capture onClose={() => setCapturing(false)} />;

  const q = nameKey(filter);
  const shown = [...pages]
    .filter((p) => type === 'all' || p.type === type)
    .filter((p) => !q || nameKey(`${p.title} ${p.body}`).includes(q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const counts = new Map<string, number>();
  for (const p of pages) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);

  return (
    <div className="nb-home">
      <div className="nb-row nb-actions">
        <button type="button" className="small-button primary" onClick={() => setCreating(true)}>
          + New page
        </button>
        <button type="button" className="small-button" onClick={() => setCapturing(true)}>
          + Capture
        </button>
      </div>
      {creating && <NewPage onDone={() => setCreating(false)} />}

      <div className="nb-filter" role="group" aria-label="Filter by type">
        <button type="button" aria-pressed={type === 'all'} onClick={() => setType('all')}>
          All {pages.length}
        </button>
        {PAGE_TYPES.filter((t) => counts.has(t.id)).map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={type === t.id}
            onClick={() => setType(t.id)}
          >
            {t.name} {counts.get(t.id)}
          </button>
        ))}
      </div>
      <input
        type="search"
        className="text-input"
        placeholder="Filter pages"
        aria-label="Filter pages"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {pages.length === 0 ? (
        <p className="muted">
          No pages yet. Start one with “+ New page”, “Today”, or “+ Capture” for an article. Links
          like [[Fort Churchill]] make pages too.
        </p>
      ) : (
        <ul className="nb-page-list">
          {shown.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => openPage(p.id)}>
                <span className="nb-page-list-title">
                  {p.title}
                  {(p.place || p.spot) && <span className="nb-on-map"> · on map</span>}
                </span>
                <span className="muted">
                  {pageTypeName(p.type)} · {new Date(p.updatedAt).toLocaleDateString()}
                </span>
                {snippet(p.body) && <span className="nb-page-list-snippet">{snippet(p.body)}</span>}
              </button>
            </li>
          ))}
          {!shown.length && <li className="muted">No pages match.</li>}
        </ul>
      )}

      <div className="nb-home-footer">
        <label className="nb-check">
          <input
            type="checkbox"
            checked={outlines}
            onChange={(e) => setOutlines(e.target.checked)}
          />
          <span>Outline notebook places on the map</span>
        </label>
        <div className="nb-row">
          <a className="small-button" href={EXPORT_URL} download>
            Export notebook (.md)
          </a>
          <a className="small-button" href={BACKUP_URL} download>
            Backup (.json)
          </a>
          <Restore />
        </div>
      </div>
    </div>
  );
}

function NewPage({ onDone }: { onDone: () => void }) {
  const create = useCreatePage();
  const openPage = useHuntStore((s) => s.openPage);
  const [title, setTitle] = useState('');
  const [type, setType] = useState<PageType>('note');
  return (
    <form
      className="nb-new"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          { title, type },
          {
            onSuccess: (page: Page) => {
              onDone();
              openPage(page.id);
            },
          },
        );
      }}
    >
      <input
        className="text-input"
        aria-label="New page title"
        placeholder="Page title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
        autoFocus
      />
      <select
        className="text-input nb-select"
        aria-label="New page type"
        value={type}
        onChange={(e) => setType(e.target.value as PageType)}
      >
        {PAGE_TYPES.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <button type="submit" className="small-button primary" disabled={create.isPending}>
        Create
      </button>
      <button type="button" className="small-button" onClick={onDone}>
        Cancel
      </button>
      {create.isError && <p className="form-error">{create.error.message}</p>}
    </form>
  );
}

/** Restore from a JSON backup: replaces everything, after a confirmation. */
function Restore() {
  const restore = useRestore();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  return (
    <>
      <label className="small-button">
        Restore…
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      {file && (
        <div className="nb-restore" role="alertdialog" aria-label="Restore from backup">
          <p>
            Replace <strong>everything</strong> (pages, notes, photos, markers) with “{file.name}”?
            The current database is saved in <code>server/data/backups</code> first.
          </p>
          <div className="nb-row">
            <button
              type="button"
              className="small-button danger"
              disabled={restore.isPending}
              onClick={() => restore.mutate(file, { onSuccess: () => setFile(null) })}
            >
              {restore.isPending ? 'Restoring…' : 'Replace everything'}
            </button>
            <button
              type="button"
              className="small-button"
              onClick={() => {
                setFile(null);
                if (input.current) input.current.value = '';
              }}
            >
              Cancel
            </button>
          </div>
          {restore.isError && <p className="form-error">{restore.error.message}</p>}
        </div>
      )}
      {restore.isSuccess && !file && (
        <p className="muted" role="status">
          Restored {restore.data.restored.pages ?? 0} pages, {restore.data.restored.placeNotes ?? 0}{' '}
          notes, {restore.data.restored.markers ?? 0} markers and {restore.data.photos} photos.
        </p>
      )}
    </>
  );
}
