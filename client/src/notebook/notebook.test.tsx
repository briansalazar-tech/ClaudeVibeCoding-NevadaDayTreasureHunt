import type { Page, PlaceNote } from '@hunt/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildPlaceIndex, searchPlaces } from '../search/searchIndex';
import { useHuntStore } from '../state/store';
import { parseBlocks } from './blocks';
import { namesInText } from './captureNames';
import { NotebookContext, type NotebookData } from './context';
import { completeLink, continueBullet, indentLines, linkQueryAt, suggestLinks } from './editing';
import { Markdown } from './Markdown';
import { notebookFeatures, pageByKey, placeNames } from './places';

const index = buildPlaceIndex([
  {
    county: 'lyon',
    entries: [
      { id: 'osm:node/1', name: 'Dayton', layer: 'towns', kind: 'town', lng: -119.59, lat: 39.24 },
      {
        id: 'osm:way/2',
        name: 'Fort Churchill',
        layer: 'parks',
        kind: 'state-park',
        lng: -119.27,
        lat: 39.29,
      },
      {
        id: 'osm:way/3',
        name: 'Fort Churchill',
        layer: 'streets',
        kind: 'local',
        lng: -119.2,
        lat: 39.3,
      },
      {
        id: 'osm:way/4',
        name: 'Main Street',
        layer: 'streets',
        kind: 'local',
        lng: -119.6,
        lat: 39.2,
      },
    ],
  },
]);
const names = placeNames(index);

function page(id: number, title: string, extra: Partial<Page> = {}): Page {
  return {
    id,
    title,
    type: 'note',
    body: '',
    sourceUrl: '',
    place: null,
    spot: null,
    createdAt: '',
    updatedAt: '',
    ...extra,
  };
}

describe('outliner editing', () => {
  it('indents and outdents the selected lines', () => {
    const text = '- one\n- two\n- three';
    const out = indentLines(text, 7, 15, false);
    expect(out.text).toBe('- one\n  - two\n  - three');
    expect(indentLines(out.text, 8, 8, true).text).toBe('- one\n- two\n  - three');
  });

  it('continues a bullet on Enter, and ends the list on an empty one', () => {
    expect(continueBullet('  - first', 9)).toEqual({ text: '  - first\n  - ', start: 14, end: 14 });
    expect(continueBullet('- first\n- ', 10)).toEqual({ text: '- first\n', start: 8, end: 8 });
    expect(continueBullet('plain line', 10)).toBeNull();
  });

  it('completes a [[ link from pages first, then map places', () => {
    const text = 'Went to [[da';
    const q = linkQueryAt(text, text.length);
    expect(q).toEqual({ start: 8, query: 'da' });
    const pages = [page(1, 'Daily plan')];
    expect(suggestLinks('da', pages, names).map((s) => s.title)).toEqual(['Daily plan', 'Dayton']);
    expect(completeLink(text, q!.start, text.length, 'Dayton').text).toBe('Went to [[Dayton]]');
  });
});

describe('the notebook on the map', () => {
  it('rings the tied place, or every place by the page name, and marks put-on-map pages', () => {
    const tied = page(1, 'Fort Churchill', {
      place: { id: 'osm:way/2', layer: 'parks', name: 'Fort Churchill', lng: -119.27, lat: 39.29 },
    });
    const untied = page(2, 'Dayton');
    const placed = page(3, 'John Mackay', { type: 'person', spot: { lng: -119.65, lat: 39.31 } });
    const features = notebookFeatures([tied, untied, placed], names).features;
    expect(features.map((f) => f.properties)).toEqual([
      { kind: 'place', id: 'osm:way/2', pageId: 1 },
      { kind: 'place', id: 'osm:node/1', pageId: 2 },
      { kind: 'spot', pageId: 3, name: 'John Mackay' },
    ]);
  });
});

describe('capture', () => {
  it('finds map place and page names, capitalized one-word names only', () => {
    const found = namesInText(
      'From Dayton we took Main Street to fort churchill. The dayton mill and [[Clue 1]].',
      { pages: [page(1, 'Clue 1'), page(2, 'Medallion')], names },
      'Article',
    );
    expect(found.map((f) => `${f.text}|${f.what}|${f.count}`)).toEqual([
      'Dayton|Map · Towns & cities|1',
      'Main Street|Map · Streets & roads|1',
      'fort churchill|Map · Parks, Streets & roads (2)|1',
    ]);
  });
});

describe('search', () => {
  it('finds pages and notes, and a county search only those on the map there', () => {
    const pages = [page(1, 'Clue 3', { body: 'The old mill' }), page(2, 'Mill trip')];
    const notes: PlaceNote[] = [
      {
        id: 1,
        place: { id: 'osm:node/1', layer: 'towns', name: 'Dayton', lng: -119.59, lat: 39.24 },
        body: 'Mill ruins behind the school',
        createdAt: '',
        updatedAt: '',
      },
    ];
    const opts = { county: null, countyAt: () => 'lyon' as const, pages, notes };
    const hits = searchPlaces(index, [], 'mill', opts).hits.map((h) => h.key);
    expect(hits).toEqual(['page|2', 'page|1', 'note|1']);
    const scoped = searchPlaces(index, [], 'mill', { ...opts, county: 'lyon' }).hits;
    expect(scoped.map((h) => h.key)).toEqual(['note|1']);
  });
});

describe('Markdown', () => {
  beforeEach(() => useHuntStore.setState({ focus: null, notebookFull: true }));

  const data: NotebookData = {
    manifest: { buildDate: '', bbox: [0, 0, 1, 1], sources: {}, counties: {} },
    pages: [page(1, 'Dayton')],
    pagesByKey: pageByKey([page(1, 'Dayton')]),
    notes: [],
    names,
    index,
    indexLoading: false,
    countyOf: () => 'lyon',
    pagesError: null,
  };

  it('reads bullets, headings and quotes', () => {
    expect(parseBlocks('# Title\n- a\n    - b\n> said\ntext').map((b) => b.type)).toEqual([
      'heading',
      'bullet',
      'bullet',
      'quote',
      'para',
    ]);
    expect(parseBlocks('    - b')[0]).toEqual({ type: 'bullet', depth: 2, text: 'b' });
  });

  it('renders links with a map pin that flies to the place', async () => {
    const user = userEvent.setup();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <NotebookContext.Provider value={data}>
          <Markdown body="- Went to **[[Dayton]]**, see https://www.hmdb.org/m.asp?m=1234 #trip" />
        </NotebookContext.Provider>
      </QueryClientProvider>,
    );
    expect(screen.getByRole('button', { name: 'Dayton' }).closest('strong')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'hmdb.org/m.asp' })).toHaveAttribute(
      'href',
      'https://www.hmdb.org/m.asp?m=1234',
    );
    expect(screen.getByRole('button', { name: '#trip' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show Dayton on the map' }));
    expect(useHuntStore.getState().focus).toMatchObject({ id: 'osm:node/1', layer: 'towns' });
    // Flying to a place leaves the full notebook view.
    expect(useHuntStore.getState().notebookFull).toBe(false);
  });
});
