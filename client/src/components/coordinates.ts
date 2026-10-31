/** Parses "39.38095, -119.64143" (or the two numbers separately) into lat/lng. */
export function parseLatLng(
  latText: string,
  lngText: string,
): { lat: number; lng: number; swapped: boolean } | string {
  let a = latText.trim();
  let b = lngText.trim();
  // A pasted pair in either box.
  const pair = /^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/;
  const inA = pair.exec(a);
  const inB = pair.exec(b);
  if (inA && !b) [a, b] = [inA[1]!, inA[2]!];
  else if (inB && !a) [a, b] = [inB[1]!, inB[2]!];
  const lat = Number(a);
  const lng = Number(b);
  if (!a || !b || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return 'Enter a latitude and longitude in decimal degrees, e.g. 39.38095, -119.64143';
  }
  // In the hunt counties latitude is positive and longitude negative, so swapped values show.
  if (lat < 0 && lng > 0) return { lat: lng, lng: lat, swapped: true };
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return 'Those coordinates are off the globe';
  return { lat, lng, swapped: false };
}
