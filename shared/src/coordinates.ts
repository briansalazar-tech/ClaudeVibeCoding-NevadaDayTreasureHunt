/**
 * Reads typed or pasted coordinates: decimal degrees (`39.38095, -119.64143`),
 * degrees-decimal-minutes (`39 22.857, -119 38.486`) and degrees-minutes-seconds
 * (`39°22'51.4"N 119°38'29.1"W`). In the hunt counties latitude is positive and longitude
 * negative, so a swapped pair, or a longitude missing its minus sign, can be corrected.
 */

export type CoordinateFormat = 'decimal' | 'dm' | 'dms';

export interface ParsedCoordinates {
  lat: number;
  lng: number;
  format: CoordinateFormat;
  /** The longitude came first and the pair was swapped. */
  swapped: boolean;
  /** The longitude had no minus sign or W, so west was assumed. */
  assumedWest: boolean;
}

interface Part {
  value: number;
  /** Count of numbers: 1 decimal degrees, 2 degrees-minutes, 3 degrees-minutes-seconds. */
  numbers: number;
  /** 'lat' or 'lng' when a hemisphere letter says so. */
  axis?: 'lat' | 'lng';
  /** A minus sign, S or W. */
  negative: boolean;
  /** A minus sign, or any hemisphere letter. */
  signed: boolean;
}

const NUMBER = /-?\d+(?:\.\d+)?/g;
const FORMATS: CoordinateFormat[] = ['decimal', 'dm', 'dms'];

function readPart(text: string): Part | null {
  const hemi = /[NSEW]/i.exec(text)?.[0]?.toUpperCase();
  const numbers = text.match(NUMBER)?.map(Number) ?? [];
  if (numbers.length < 1 || numbers.length > 3) return null;
  const [d, m = 0, s = 0] = numbers as [number, number?, number?];
  if (numbers.length > 1 && (m < 0 || m >= 60 || s < 0 || s >= 60)) return null;
  if (numbers.length > 1 && !Number.isInteger(d)) return null;
  const negative = d < 0 || text.trim().startsWith('-') || hemi === 'S' || hemi === 'W';
  const value = Math.abs(d) + m / 60 + s / 3600;
  return {
    value: negative ? -value : value,
    numbers: numbers.length,
    axis: hemi === 'N' || hemi === 'S' ? 'lat' : hemi === 'E' || hemi === 'W' ? 'lng' : undefined,
    negative,
    signed: negative || hemi !== undefined,
  };
}

/** Splits the text into its two coordinates, or returns null if it doesn't look like a pair. */
function splitPair(text: string): [string, string] | null {
  // Only digits, signs, separators, degree/minute/second marks and hemisphere letters.
  if (!/^[\s\d.,;:°º'′’"″”\-NSEWnsewdms]+$/.test(text)) return null;
  const bySeparator = text.split(/[,;]/);
  if (bySeparator.length === 2) return [bySeparator[0]!, bySeparator[1]!];
  if (bySeparator.length > 2) return null;
  // A hemisphere letter between the two: 39°22'51"N 119°38'29"W, or N39 22.8 W119 38.4.
  const between = /^(.*?\d[^NSEW\d]*[NSEW])\s*(.+)$/i.exec(text.trim());
  if (between && /\d/.test(between[2]!)) return [between[1]!, between[2]!];
  const leading = /^([NSEW][^NSEW]+)([NSEW].+)$/i.exec(text.trim());
  if (leading) return [leading[1]!, leading[2]!];
  // Plain numbers: split them evenly (2 decimal, 4 degrees-minutes, 6 DMS).
  const numbers = text
    .trim()
    .split(/[\s°º'′’"″”]+/)
    .filter(Boolean);
  if (![2, 4, 6].includes(numbers.length)) return null;
  const half = numbers.length / 2;
  return [numbers.slice(0, half).join(' '), numbers.slice(half).join(' ')];
}

export function parseCoordinates(input: string): ParsedCoordinates | null {
  // 39d22m51.4s: letters as unit marks. An "s" after a number is seconds, not south, when a
  // hemisphere letter follows.
  const text = input
    .trim()
    .replace(/(\d)\s*d(?=\s*\d)/g, '$1°')
    .replace(/(\d)\s*m(?=\s*\d)/g, "$1'")
    .replace(/(\d)\s*s(?=\s*[NSEW])/g, '$1"');
  if (!/\d/.test(text)) return null;
  const pair = splitPair(text);
  if (!pair) return null;
  const a = readPart(pair[0]);
  const b = readPart(pair[1]);
  if (!a || !b || a.numbers !== b.numbers) return null;
  const format = FORMATS[a.numbers - 1]!;

  // Which number is the latitude: hemisphere letters decide, then the hunt area's signs.
  let swapped: boolean;
  if (a.axis || b.axis) swapped = a.axis === 'lng' || b.axis === 'lat';
  else if (a.negative !== b.negative) swapped = a.negative;
  else swapped = Math.abs(a.value) > 90 && Math.abs(b.value) <= 90;
  const lat = swapped ? b : a;
  const lng = swapped ? a : b;

  let lngValue = lng.value;
  const assumedWest = !lng.signed && lngValue > 0;
  if (assumedWest) lngValue = -lngValue;
  if (Math.abs(lat.value) > 90 || Math.abs(lngValue) > 180) return null;
  return { lat: lat.value, lng: lngValue, format, swapped, assumedWest };
}

/** `39°22'51.4"N` style, for showing a coordinate back in degrees-minutes-seconds. */
export function formatDms(value: number, axis: 'lat' | 'lng'): string {
  const hemi = axis === 'lat' ? (value < 0 ? 'S' : 'N') : value < 0 ? 'W' : 'E';
  let seconds = Math.round(Math.abs(value) * 36000) / 10;
  const d = Math.floor(seconds / 3600);
  seconds -= d * 3600;
  const m = Math.floor(seconds / 60);
  const s = (seconds - m * 60).toFixed(1);
  return `${d}°${m}′${s}″${hemi}`;
}
