import {
  PAGE_TYPES,
  countyDisplayName,
  getCounty,
  layerName,
  nameKey,
  type CountyId,
  type Page,
  type PageType,
  type PlaceRef,
  type Reference,
} from '@hunt/shared';
import { useEffect, useState } from 'react';
import { useHuntStore } from '../state/store';
import { useDeletePage, useLinkMentions, usePageReferences, useSavePage } from './api';
import { useNotebook } from './context';
import { Editor } from './Editor';
import { Inline, Markdown } from './Markdown';
import { Photos } from './Photos';
import { entryPlace, findEntry, goToPlace } from './places';

const SAVE_DELAY = 800;

/** One page. Keyed by page id by its parent, so opening another page starts fresh. */
export function PageView({ page }: { page: Page }) {
  const save = useSavePage();
  const [editing, setEditing] = useState(!page.body);
  // What's being typed; null shows the saved text (which a rename elsewhere can change).
  const [draft, setDraft] = useState<string | null>(null);
  const body = draft ?? page.body;

  // Autosave a moment after typing stops.
  useEffect(() => {
    if (draft === null || draft === page.body) return;
    const timer = setTimeout(
      () => save.mutate({ id: page.id, patch: { body: draft } }),
      SAVE_DELAY,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save on text changes only
  }, [draft]);

  const finish = () => {
    setEditing(false);
    if (draft === null || draft === page.body) {
      setDraft(null);
      return;
    }
    // Keep showing the draft until it's saved.
    save.mutate({ id: page.id, patch: { body: draft } }, { onSuccess: () => setDraft(null) });
  };

  return (
    <article className="nb-page" aria-labelledby="nb-page-title">
      <TitleRow page={page} />
      <div className="nb-page-meta">
        <select
          aria-label="Page type"
          className="text-input nb-select"
          value={page.type}
          onChange={(e) =>
            save.mutate({ id: page.id, patch: { type: e.target.value as PageType } })
          }
        >
          {PAGE_TYPES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <SourceLink page={page} />
      </div>

      <section className="nb-section">
        {editing ? (
          <>
            <Editor
              label="Page text"
              value={body}
              onChange={setDraft}
              onDone={finish}
              autoFocus
              rows={12}
              placeholder="- Start a bullet, # Heading, > quote, **bold**, [[link]], #tag"
            />
            <div className="nb-row">
              <button type="button" className="small-button" onClick={finish}>
                Done
              </button>
              <span className="muted nb-save-state" role="status">
                {save.isPending ? 'Saving…' : save.isError ? save.error.message : ''}
              </span>
            </div>
          </>
        ) : (
          <>
            {body.trim() ? <Markdown body={body} /> : <p className="muted">Nothing written yet.</p>}
            <button type="button" className="small-button" onClick={() => setEditing(true)}>
              Edit
            </button>
          </>
        )}
      </section>

      <MapSection page={page} />
      <Photos pageId={page.id} />
      <References page={page} />
      <DeletePage page={page} />
    </article>
  );
}

function TitleRow({ page }: { page: Page }) {
  const save = useSavePage();
  const [title, setTitle] = useState(page.title);
  const [shownFor, setShownFor] = useState(page.title);
  const [message, setMessage] = useState('');
  if (shownFor !== page.title) {
    setShownFor(page.title);
    setTitle(page.title);
  }
  const commit = () => {
    const next = title.trim();
    if (!next || next === page.title) {
      setTitle(page.title);
      return;
    }
    save.mutate(
      { id: page.id, patch: { title: next } },
      {
        onSuccess: ({ relinked }) =>
          setMessage(
            relinked
              ? `Renamed. ${relinked} link${relinked === 1 ? '' : 's'} updated.`
              : 'Renamed.',
          ),
        onError: (err) => {
          setMessage(err.message);
          setTitle(page.title);
        },
      },
    );
  };
  return (
    <div className="nb-title-row">
      <input
        id="nb-page-title"
        className="nb-title"
        aria-label="Page title"
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          setMessage('');
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            e.stopPropagation();
            setTitle(page.title);
          }
        }}
      />
      {message && (
        <p className="muted nb-title-note" role="status">
          {message}
        </p>
      )}
    </div>
  );
}

function SourceLink({ page }: { page: Page }) {
  const save = useSavePage();
  const [url, setUrl] = useState(page.sourceUrl);
  const [shownFor, setShownFor] = useState(`${page.id}|${page.sourceUrl}`);
  if (shownFor !== `${page.id}|${page.sourceUrl}`) {
    setShownFor(`${page.id}|${page.sourceUrl}`);
    setUrl(page.sourceUrl);
  }
  if (page.type !== 'article' && !page.sourceUrl) return null;
  return (
    <div className="nb-source">
      <input
        className="text-input"
        type="url"
        aria-label="Source link"
        placeholder="Source link (https://…)"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onBlur={() => {
          if (url.trim() !== page.sourceUrl)
            save.mutate({ id: page.id, patch: { sourceUrl: url.trim() } });
        }}
      />
      {/^https?:\/\//.test(page.sourceUrl) && (
        <a href={page.sourceUrl} target="_blank" rel="noopener noreferrer" className="small-button">
          Open
        </a>
      )}
    </div>
  );
}

function countyLabel(county: CountyId | null | undefined): string {
  const c = county ? getCounty(county) : undefined;
  return c ? countyDisplayName(c) : 'outside the hunt counties';
}

/** The map side of a page: the place it's about ("This one"), and where it's been put. */
function MapSection({ page }: { page: Page }) {
  const { names, countyOf, indexLoading } = useNotebook();
  const save = useSavePage();
  const setPlacingPage = useHuntStore((s) => s.setPlacingPage);
  const placing = useHuntStore((s) => s.placingPage === page.id);
  const matches = (names.get(nameKey(page.title)) ?? []).slice(0, 25);
  const tie = (place: PlaceRef | null) => save.mutate({ id: page.id, patch: { place } });

  return (
    <section className="nb-section" aria-labelledby="nb-map-heading">
      <h3 id="nb-map-heading" className="nb-section-title">
        On the map
      </h3>
      {page.place ? (
        <div className="nb-place">
          <p>
            About <strong>{page.place.name}</strong>{' '}
            <span className="muted">
              · {layerName(page.place.layer)} ·{' '}
              {countyLabel(countyOf(page.place.lng, page.place.lat))}
            </span>
          </p>
          <div className="nb-row">
            <button
              type="button"
              className="small-button"
              onClick={() =>
                goToPlace(page.place!, {
                  entry: findEntry(names, page.place!),
                  county: countyOf(page.place!.lng, page.place!.lat),
                })
              }
            >
              Show on map
            </button>
            {matches.length > 1 && (
              <button type="button" className="small-button" onClick={() => tie(null)}>
                Pick another
              </button>
            )}
          </div>
        </div>
      ) : matches.length === 1 ? (
        <div className="nb-place">
          <p>
            {matches[0]!.name}{' '}
            <span className="muted">
              · {layerName(matches[0]!.layer)} · {countyLabel(matches[0]!.county)}
            </span>
          </p>
          <button
            type="button"
            className="small-button"
            onClick={() => goToPlace(entryPlace(matches[0]!), { entry: matches[0] })}
          >
            Show on map
          </button>
        </div>
      ) : matches.length > 1 ? (
        <div className="nb-place">
          <p className="muted">
            {matches.length} places share this name. Pick the one this page is about:
          </p>
          <ul className="nb-matches">
            {matches.map((e) => (
              <li key={`${e.county}|${e.layer}|${e.id}`}>
                <span>
                  {layerName(e.layer)} · {countyLabel(e.county)}
                </span>
                <span className="nb-row">
                  <button
                    type="button"
                    className="small-button"
                    onClick={() => goToPlace(entryPlace(e), { entry: e })}
                  >
                    Show
                  </button>
                  <button type="button" className="small-button" onClick={() => tie(entryPlace(e))}>
                    This one
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="muted">
          {indexLoading ? 'Looking for map places by this name…' : 'No map place has this name.'}
        </p>
      )}

      <div className="nb-spot">
        {page.spot ? (
          <>
            <p>
              Put on the map at{' '}
              <code>
                {page.spot.lat.toFixed(5)}, {page.spot.lng.toFixed(5)}
              </code>
            </p>
            <div className="nb-row">
              <button
                type="button"
                className="small-button"
                onClick={() =>
                  goToPlace(
                    {
                      id: `page:${page.id}`,
                      layer: 'custom',
                      name: page.title,
                      lng: page.spot!.lng,
                      lat: page.spot!.lat,
                    },
                    { county: countyOf(page.spot!.lng, page.spot!.lat) },
                  )
                }
              >
                Show
              </button>
              <button
                type="button"
                className="small-button"
                onClick={() => setPlacingPage(page.id)}
              >
                Move
              </button>
              <button
                type="button"
                className="small-button"
                onClick={() => save.mutate({ id: page.id, patch: { spot: null } })}
              >
                Remove from map
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="small-button"
            aria-pressed={placing}
            onClick={() => setPlacingPage(placing ? null : page.id)}
          >
            {placing ? 'Click the map… (cancel)' : 'Put on map'}
          </button>
        )}
      </div>
    </section>
  );
}

function SourceButton({ reference }: { reference: Reference }) {
  const openPage = useHuntStore((s) => s.openPage);
  const { names, countyOf } = useNotebook();
  const { source } = reference;
  const label =
    source.kind === 'page'
      ? source.title
      : source.kind === 'note'
        ? `Map note · ${source.title}`
        : `Marker · ${source.title}`;
  return (
    <button
      type="button"
      className="link-button nb-ref-title"
      onClick={() => {
        if (source.kind === 'page') openPage(source.id);
        else if (source.place)
          goToPlace(source.place, {
            entry: findEntry(names, source.place),
            county: countyOf(source.place.lng, source.place.lat),
          });
      }}
    >
      {label}
    </button>
  );
}

function References({ page }: { page: Page }) {
  const refs = usePageReferences(page.id);
  const linkMentions = useLinkMentions();
  const linked = refs.data?.linked ?? [];
  const unlinked = refs.data?.unlinked ?? [];
  return (
    <>
      <section className="nb-section" aria-labelledby="nb-linked-heading">
        <h3 id="nb-linked-heading" className="nb-section-title">
          Linked references ({linked.length})
        </h3>
        {refs.isPending && <p className="muted">Loading…</p>}
        {refs.isError && <p className="form-error">{refs.error.message}</p>}
        {refs.isSuccess && !linked.length && <p className="muted">Nothing links here yet.</p>}
        <ul className="nb-refs">
          {linked.map((r) => (
            <li key={`${r.source.kind}|${r.source.id}`}>
              <SourceButton reference={r} />
              {r.snippets.map((s, i) => (
                <p key={i} className="nb-snippet">
                  <Inline text={s} />
                </p>
              ))}
            </li>
          ))}
        </ul>
      </section>
      <section className="nb-section" aria-labelledby="nb-unlinked-heading">
        <h3 id="nb-unlinked-heading" className="nb-section-title">
          Unlinked references ({unlinked.length})
        </h3>
        {refs.isSuccess && !unlinked.length && (
          <p className="muted">No plain mentions of “{page.title}”.</p>
        )}
        <ul className="nb-refs">
          {unlinked.map((r) => (
            <li key={`${r.source.kind}|${r.source.id}`}>
              <div className="nb-row nb-ref-head">
                <SourceButton reference={r} />
                <button
                  type="button"
                  className="small-button"
                  disabled={linkMentions.isPending}
                  onClick={() =>
                    linkMentions.mutate({ kind: r.source.kind, id: r.source.id, title: page.title })
                  }
                >
                  Link
                </button>
              </div>
              {r.snippets.map((s, i) => (
                <p key={i} className="nb-snippet">
                  <Inline text={s} />
                </p>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function DeletePage({ page }: { page: Page }) {
  const remove = useDeletePage();
  const openPage = useHuntStore((s) => s.openPage);
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="nb-section nb-row">
      {confirming ? (
        <>
          <span>Delete “{page.title}” and its photos? Links to it stay as text.</span>
          <button
            type="button"
            className="small-button danger"
            disabled={remove.isPending}
            onClick={() => remove.mutate(page.id, { onSuccess: () => openPage(null) })}
          >
            Delete
          </button>
          <button type="button" className="small-button" onClick={() => setConfirming(false)}>
            Keep
          </button>
        </>
      ) : (
        <button type="button" className="small-button" onClick={() => setConfirming(true)}>
          Delete page…
        </button>
      )}
      {remove.isError && <p className="form-error">{remove.error.message}</p>}
    </div>
  );
}
