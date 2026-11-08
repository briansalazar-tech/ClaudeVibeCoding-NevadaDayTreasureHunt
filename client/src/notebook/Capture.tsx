import { PAGE_TYPES, type Page, type PageType } from '@hunt/shared';
import { useState } from 'react';
import { useHuntStore } from '../state/store';
import { useCreatePage, useLinkNames } from './api';
import { namesInText, type FoundName } from './captureNames';
import { useNotebook } from './context';

/** "+ Capture": a pasted article saved as a page, then the names in it offered as links. */
export function Capture({ onClose }: { onClose: () => void }) {
  const notebook = useNotebook();
  const openPage = useHuntStore((s) => s.openPage);
  const create = useCreatePage();
  const linkNames = useLinkNames();
  const [title, setTitle] = useState('');
  const [type, setType] = useState<PageType>('article');
  const [sourceUrl, setSourceUrl] = useState('');
  const [text, setText] = useState('');
  const [saved, setSaved] = useState<{ page: Page; found: FoundName[] } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  if (saved) {
    const done = () => {
      openPage(saved.page.id);
      onClose();
    };
    const names = saved.found.filter((f) => picked.has(f.key)).map((f) => f.text);
    return (
      <section className="nb-capture" aria-labelledby="nb-capture-heading">
        <h3 id="nb-capture-heading">Saved “{saved.page.title}”</h3>
        {saved.found.length ? (
          <>
            <p className="muted">
              Found {saved.found.length} name{saved.found.length === 1 ? '' : 's'} from the map and
              your notebook. Link the ones that mean what you think:
            </p>
            <ul className="nb-found">
              {saved.found.map((f) => (
                <li key={f.key}>
                  <label>
                    <input
                      type="checkbox"
                      checked={picked.has(f.key)}
                      onChange={(e) => {
                        const next = new Set(picked);
                        if (e.target.checked) next.add(f.key);
                        else next.delete(f.key);
                        setPicked(next);
                      }}
                    />
                    <span>{f.text}</span>
                    <span className="muted">
                      {f.what}
                      {f.count > 1 ? ` · ${f.count}×` : ''}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="nb-row">
              <button
                type="button"
                className="small-button primary"
                disabled={!names.length || linkNames.isPending}
                onClick={() => linkNames.mutate({ id: saved.page.id, names }, { onSuccess: done })}
              >
                Link {names.length} and open
              </button>
              <button type="button" className="small-button" onClick={done}>
                Open without linking
              </button>
            </div>
            {linkNames.isError && <p className="form-error">{linkNames.error.message}</p>}
          </>
        ) : (
          <>
            <p className="muted">
              {notebook.indexLoading
                ? 'The map’s place names are still loading, so none were looked for.'
                : 'No map place or page names found in it.'}
            </p>
            <button type="button" className="small-button" onClick={done}>
              Open page
            </button>
          </>
        )}
      </section>
    );
  }

  return (
    <form
      className="nb-capture"
      aria-labelledby="nb-capture-heading"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate(
          { title, type, sourceUrl, body: text },
          {
            onSuccess: (page) => {
              const found = namesInText(page.body, notebook, page.title);
              setPicked(new Set(found.map((f) => f.key)));
              setSaved({ page, found });
            },
          },
        );
      }}
    >
      <h3 id="nb-capture-heading">Capture an article</h3>
      <label className="field">
        <span>Title</span>
        <input
          className="text-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          autoFocus
        />
      </label>
      <div className="nb-row">
        <label className="field">
          <span>Type</span>
          <select
            className="text-input"
            value={type}
            onChange={(e) => setType(e.target.value as PageType)}
          >
            {PAGE_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field nb-grow">
          <span>Source link</span>
          <input
            className="text-input"
            type="url"
            placeholder="https://…"
            value={sourceUrl}
            onChange={(e) => setSourceUrl(e.target.value)}
          />
        </label>
      </div>
      <label className="field">
        <span>Text</span>
        <textarea
          className="text-input nb-textarea"
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the article"
        />
      </label>
      {create.isError && <p className="form-error">{create.error.message}</p>}
      <div className="nb-row">
        <button type="submit" className="small-button primary" disabled={create.isPending}>
          Save
        </button>
        <button type="button" className="small-button" onClick={onClose}>
          Cancel
        </button>
      </div>
    </form>
  );
}
