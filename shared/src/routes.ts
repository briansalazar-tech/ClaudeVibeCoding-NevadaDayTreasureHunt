/**
 * Route numbers. OSM tags Nevada roads as `SR 341`, `US 50` and `I-80`, sometimes several on
 * one road (`US 395 BUS, SR 341, SR 431`). People type them many ways (`NV-341`, `Hwy 50`,
 * `Interstate 80`), so both sides go through the same canonical form.
 */

function suffix(rest: string, alt: boolean): string {
  const s = rest.trim().toUpperCase();
  if (!s) return '';
  if (/^(ALT|ALTERNATE)$/.test(s) || (alt && s === 'A')) return ' ALT';
  if (/^(BUS|BUSINESS|B)$/.test(s)) return ' BUS';
  if (/^(TRUCK|TRK)$/.test(s)) return ' TRUCK';
  return ` ${s}`;
}

/** The canonical form of one route number, or null if it isn't one we recognize. */
export function canonicalRoute(text: string): string | null {
  let t = text.trim().replace(/\s+/g, ' ').toUpperCase();
  let old = false;
  if (/^OLD /.test(t) || / OLD$/.test(t)) {
    old = true;
    t = t.replace(/^OLD /, '').replace(/ OLD$/, '');
  }
  const prefix = old ? 'Old ' : '';
  let m = /^(?:I|IH|INTERSTATE)(?: HIGHWAY| HWY)?[ -]?(\d+)(?:[ -]?(.*))?$/.exec(t);
  if (m) return `${prefix}I-${m[1]}${suffix(m[2] ?? '', false)}`;
  m = /^(?:US|U\.S\.)(?: HIGHWAY| HWY| ROUTE| RTE)?[ -]?(\d+)(?:[ -]?(.*))?$/.exec(t);
  if (m) return `${prefix}US ${m[1]}${suffix(m[2] ?? '', true)}`;
  m =
    /^(?:SR|NV|NEV|NEVADA|NV SR|STATE (?:ROUTE|RTE|HIGHWAY|HWY)|NEVADA STATE (?:ROUTE|HIGHWAY))[ -]?(\d+)([A-Z]?)(?: (.*))?$/.exec(
      t,
    );
  if (m) return `${prefix}SR ${m[1]}${m[2] ?? ''}${suffix(m[3] ?? '', false)}`;
  // Forest, county and BIA roads: FR 22202, CR 101.
  m = /^(FR|NFR|FS|NF|CR|BIA)[ -]?(\w+)$/.exec(t);
  if (m) return `${prefix}${m[1]} ${m[2]}`;
  return null;
}

/** The routes in an OSM `ref` value, canonical, skipping bare numbers. */
export function splitRefs(ref: string | undefined): string[] {
  if (!ref) return [];
  const out = new Set<string>();
  for (const part of ref.split(/[;,]/)) {
    const route = canonicalRoute(part);
    if (route) out.add(route);
  }
  return [...out];
}

/**
 * Routes a search box entry could mean, or null if it isn't a route number.
 * "Highway 50" could be US 50 or SR 50, so it gives both.
 */
export function parseRouteQuery(text: string): string[] | null {
  const t = text.trim();
  const generic = /^(?:highway|hwy|route|rte)\.? ?(\d+[a-z]?)$/i.exec(t);
  if (generic) return [`US ${generic[1]!.toUpperCase()}`, `SR ${generic[1]!.toUpperCase()}`];
  const route = canonicalRoute(t);
  return route ? [route] : null;
}

/** Whether a mapped route answers a route query: the same route, or a variant (`US 95 ALT`). */
export function routeMatches(route: string, query: string): boolean {
  return route === query || route.startsWith(`${query} `);
}
