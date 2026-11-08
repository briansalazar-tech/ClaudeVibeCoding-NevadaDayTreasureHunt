import { describe, expect, it } from 'vitest';
import {
  dailyTitle,
  findMentions,
  findNames,
  linkMatches,
  nameKey,
  parseLinks,
  renameLinks,
  shortUrl,
  tokenizeInline,
} from './notebook-text.js';

describe('tokenizeInline', () => {
  it('finds links, tags, web links and bold', () => {
    const tokens = tokenizeInline(
      'Met **[[John Smith]]** at #fieldwork near #[[Fort Churchill]], see https://hmdb.org/m.asp?m=1.',
    );
    expect(tokens.filter((t) => t.type !== 'text')).toEqual([
      expect.objectContaining({ type: 'bold' }),
      expect.objectContaining({ type: 'link', title: 'John Smith' }),
      expect.objectContaining({ type: 'bold' }),
      expect.objectContaining({ type: 'tag', title: 'fieldwork' }),
      expect.objectContaining({ type: 'tag', title: 'Fort Churchill' }),
      expect.objectContaining({ type: 'url', url: 'https://hmdb.org/m.asp?m=1' }),
    ]);
    // The sentence's period stays text.
    expect(tokens.at(-1)).toMatchObject({ type: 'text', text: '.' });
  });

  it('does not read numbers, headings or URL fragments as tags', () => {
    const tags = (s: string) => tokenizeInline(s).filter((t) => t.type === 'tag');
    expect(tags('Marker #5 and # Heading')).toEqual([]);
    expect(tags('https://example.com/page#section')).toEqual([]);
  });

  it('keeps balanced parentheses in a URL', () => {
    const [url] = tokenizeInline('(https://en.wikipedia.org/wiki/Como_(Nevada))').filter(
      (t) => t.type === 'url',
    );
    expect(url).toMatchObject({ url: 'https://en.wikipedia.org/wiki/Como_(Nevada)' });
  });
});

describe('names', () => {
  it('compares names ignoring case, accents and punctuation', () => {
    expect(nameKey('Fort Churchill.')).toBe('fort churchill');
    expect(nameKey('fort-churchill')).toBe('fort churchill');
    expect(nameKey("O'Brien Piñon")).toBe('obrien pinon');
  });

  it('lists links and tags once each', () => {
    expect(parseLinks('[[Dayton]] and [[dayton]] #dayton #[[Six Mile Canyon]]')).toEqual([
      { title: 'Dayton', key: 'dayton', kind: 'link' },
      { title: 'dayton', key: 'dayton', kind: 'tag' },
      { title: 'Six Mile Canyon', key: 'six mile canyon', kind: 'tag' },
    ]);
  });

  it('renames links and tags, in any spelling', () => {
    const out = renameLinks('[[clue 1]], [[Clue 1.]] and #[[clue 1]]', 'Clue 1', 'Clue One');
    expect(out).toEqual({ text: '[[Clue One]], [[Clue One]] and #[[Clue One]]', count: 3 });
    expect(renameLinks('#clue', 'clue', 'Big Clue').text).toBe('#[[Big Clue]]');
    expect(renameLinks('#clue', 'clue', 'clues').text).toBe('#clues');
  });
});

describe('findNames', () => {
  const names = new Map([
    ['fort churchill', 'Fort Churchill'],
    ['fort churchill state historic park', 'Fort Churchill State Historic Park'],
    ['dayton', 'Dayton'],
    ['spring', 'Spring'],
  ]);

  it('finds the longest name, in any case, and skips text already linked', () => {
    const text =
      'From [[Dayton]] we drove to fort churchill state historic park, then fort churchill.';
    expect(findNames(text, names).map((m) => m.text)).toEqual([
      'fort churchill state historic park',
      'fort churchill',
    ]);
  });

  it('can require one-word names to be capitalized', () => {
    const text = 'A spring near Spring Valley, and Dayton.';
    expect(findNames(text, names, { capitalizedSingleWords: true }).map((m) => m.text)).toEqual([
      'Spring',
      'Dayton',
    ]);
  });

  it('links mentions keeping the text as written', () => {
    const text = 'Went to fort churchill. Fort Churchill was quiet.';
    const out = linkMatches(text, findMentions(text, 'Fort Churchill'));
    expect(out).toBe('Went to [[fort churchill]]. [[Fort Churchill]] was quiet.');
  });
});

describe('shortUrl and dailyTitle', () => {
  it('shortens long web links', () => {
    expect(shortUrl('https://www.hmdb.org/m.asp')).toBe('hmdb.org/m.asp');
    expect(
      shortUrl('https://www.nevadaappeal.com/news/2019/oct/31/nevada-day-medallion-found-at-park/'),
    ).toBe('nevadaappeal.com/…/nevada-day-medallion-fo…');
  });

  it('titles a daily note by its date', () => {
    expect(dailyTitle(new Date(2026, 10, 2))).toBe('November 2, 2026');
  });
});
