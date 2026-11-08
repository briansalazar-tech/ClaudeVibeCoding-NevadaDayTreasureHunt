import { nameKey, shortUrl, tokenizeInline } from '@hunt/shared';
import type { ReactNode } from 'react';
import { useHuntStore } from '../state/store';
import { parseBlocks } from './blocks';
import { useOpenPage } from './api';
import { useNotebook } from './context';
import { findEntry, goToPlace, linkPlaces } from './places';

/** A `[[link]]` or `#tag`: opens the page (made on first click), with a pin if it's on the map. */
export function PageLink({ title, tag = false }: { title: string; tag?: boolean }) {
  const { pagesByKey, names } = useNotebook();
  const openPage = useHuntStore((s) => s.openPage);
  const open = useOpenPage();
  const places = linkPlaces(title, pagesByKey, names);
  const exists = pagesByKey.has(nameKey(title));
  const go = () => open.mutate({ title }, { onSuccess: (page) => openPage(page.id) });
  return (
    <span className="nb-link-wrap">
      <button
        type="button"
        className={tag ? 'nb-tag' : 'nb-link'}
        data-new={!exists || undefined}
        onClick={go}
        disabled={open.isPending}
      >
        {tag ? `#${title}` : title}
      </button>
      {places.length > 0 && (
        <button
          type="button"
          className="nb-pin"
          aria-label={
            places.length === 1 ? `Show ${title} on the map` : `${title}: ${places.length} places`
          }
          title={
            places.length === 1 ? 'Show on the map' : `${places.length} places share this name`
          }
          onClick={() => {
            // Several places by this name: the page lists them, with "This one".
            if (places.length === 1) goToPlace(places[0]!, { entry: findEntry(names, places[0]!) });
            else go();
          }}
        >
          <PinIcon />
          {places.length > 1 && <span className="nb-pin-count">{places.length}</span>}
        </button>
      )}
    </span>
  );
}

export function PinIcon() {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d="M8 1.5a4.5 4.5 0 0 0-4.5 4.5c0 3.2 4.5 8.5 4.5 8.5s4.5-5.3 4.5-8.5A4.5 4.5 0 0 0 8 1.5Zm0 6.2a1.7 1.7 0 1 1 0-3.4 1.7 1.7 0 0 1 0 3.4Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** One line's links, tags, web links and **bold**. */
export function Inline({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let bold = false;
  let run: ReactNode[] = [];
  const flush = (key: number) => {
    if (!run.length) return;
    out.push(bold ? <strong key={`b${key}`}>{run}</strong> : <span key={`s${key}`}>{run}</span>);
    run = [];
  };
  tokenizeInline(text).forEach((t, i) => {
    if (t.type === 'bold') {
      flush(i);
      bold = !bold;
    } else if (t.type === 'text') run.push(t.text);
    else if (t.type === 'link') run.push(<PageLink key={i} title={t.title} />);
    else if (t.type === 'tag') run.push(<PageLink key={i} title={t.title} tag />);
    else
      run.push(
        <a key={i} href={t.url} target="_blank" rel="noopener noreferrer" title={t.url}>
          {shortUrl(t.url)}
        </a>,
      );
  });
  flush(-1);
  return <>{out}</>;
}

export function Markdown({ body }: { body: string }) {
  const blocks = parseBlocks(body);
  return (
    <div className="nb-body">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading': {
            const H = `h${b.level + 2}` as 'h3' | 'h4' | 'h5';
            return (
              <H key={i} className="nb-heading">
                <Inline text={b.text} />
              </H>
            );
          }
          case 'quote':
            return (
              <blockquote key={i} className="nb-quote">
                <Inline text={b.text} />
              </blockquote>
            );
          case 'bullet':
            return (
              <div key={i} className="nb-bullet" style={{ marginLeft: `${b.depth * 1.25}em` }}>
                <Inline text={b.text} />
              </div>
            );
          case 'para':
            return (
              <p key={i} className="nb-para">
                <Inline text={b.text} />
              </p>
            );
          default:
            return <div key={i} className="nb-blank" />;
        }
      })}
    </div>
  );
}
