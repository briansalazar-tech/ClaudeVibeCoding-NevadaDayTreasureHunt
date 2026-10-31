/**
 * Name matching for deduplication: case-, accent- and punctuation-insensitive,
 * with the common abbreviations spelled out ("Mt." and "Mount" match).
 */
const ABBREVIATIONS: Record<string, string> = {
  mt: 'mount',
  mtn: 'mountain',
  mtns: 'mountains',
  st: 'saint',
  ft: 'fort',
  spgs: 'springs',
  spg: 'spring',
  cyn: 'canyon',
  ck: 'creek',
  cr: 'creek',
  pk: 'peak',
  lk: 'lake',
  res: 'reservoir',
};

/** Drops a leading byte-order mark, which some CSV and text downloads start with. */
export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => ABBREVIATIONS[w] ?? w)
    .join(' ');
}

const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'de',
  'for',
  'in',
  'of',
  'on',
  'the',
  'to',
]);

/** "SILVER SPRINGS PARK" → "Silver Springs Park". For sources that publish names in capitals. */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(/(\s+|-|\/)/)
    .map((w, i) => {
      if (!/[a-z]/.test(w)) return w;
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      if (/^(ii|iii|iv|gid|hoa|usa|blm|nv|us|vfw)$/.test(w)) return w.toUpperCase();
      return w.replace(/^([^a-z]*)([a-z])/, (_m, pre: string, c: string) => pre + c.toUpperCase());
    })
    .join('');
}
