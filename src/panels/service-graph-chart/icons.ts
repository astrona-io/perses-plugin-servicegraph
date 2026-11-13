import { NodeKind } from "./graph";

/**
 * Node icons: a filled disc in the kind's colour with a white line glyph on top, drawn as one SVG and
 * handed to ECharts as an `image://` symbol. ECharts' own symbols are single paths, so a glyph inside a
 * coloured disc (and a dashed or severity ring around it) has to be an image. The legend uses the same
 * SVG, so the two always match.
 */

/** A node kind, or a more specific glyph picked from the node's name (see `iconFor`). */
export type IconName =
  NodeKind | "auth" | "mail" | "cache" | "storage" | "web" | "search";

/** Glyphs on a 24×24 grid, stroked, no fill. */
const GLYPHS: Record<IconName, string> = {
  // A pod: an isometric cube.
  service:
    "M12 3.5 19.5 7.75v8.5L12 20.5l-7.5-4.25v-8.5Z M4.5 7.75 12 12l7.5-4.25 M12 12v8.5",
  // A cylinder.
  database:
    "M5 6.5c0-1.66 3.13-3 7-3s7 1.34 7 3-3.13 3-7 3-7-1.34-7-3Z M5 6.5v11c0 1.66 3.13 3 7 3s7-1.34 7-3v-11 M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3",
  // An envelope.
  messaging: "M4 6.5h16v11H4Z M4 7l8 6 8-6",
  // A person.
  user: "M12 4a3.5 3.5 0 1 1 0 7a3.5 3.5 0 1 1 0-7Z M5 20c0-3.6 3.13-6 7-6s7 2.4 7 6",
  // A question mark: nothing on this side of the call reported a span.
  external:
    "M8.75 9a3.25 3.25 0 1 1 4.6 2.95c-.85.4-1.35 1.15-1.35 2.05v.75 M12 18.5v.25",
  auth: "M15 4a5 5 0 1 1-4.55 7.07L4 17.5V20h3v-2h2v-2h2l.93-.93A5 5 0 0 1 15 4Z M16.5 7.5v.01",
  mail: "M20.5 3.5 3.5 10.25l7 2.75 2.75 7Z M20.5 3.5 10.5 13",
  cache: "M13.5 3 6 13.5h5.5L10.5 21 18 10.5h-5.5Z",
  storage: "M3.5 5h17v4h-17Z M5 9v10h14V9 M10 13h4",
  web: "M12 3.5a8.5 8.5 0 1 1 0 17a8.5 8.5 0 1 1 0-17Z M3.5 12h17 M12 3.5c2.25 2.3 3.4 5.1 3.4 8.5s-1.15 6.2-3.4 8.5c-2.25-2.3-3.4-5.1-3.4-8.5S9.75 5.8 12 3.5Z",
  search: "M10.5 4a6.5 6.5 0 1 1 0 13a6.5 6.5 0 1 1 0-13Z M15.25 15.25 20 20",
};

/**
 * Name patterns for common infrastructure roles, first match wins: a node whose name says it is a cache,
 * a search engine, object storage, an identity provider, a mail relay or a web front gets that glyph
 * instead of its kind's. Databases and message brokers only take the rules that fit them (a Redis is a
 * cache, not a generic database).
 */
const NAME_RULES: Array<[RegExp, IconName, boolean]> = [
  // [pattern, glyph, also for databases and messaging]
  [/redis|valkey|memcache|dragonfly|keydb|cache/, "cache", true],
  [/elastic|opensearch|meili|typesense|solr|search/, "search", true],
  [/minio|garage|\bs3\b|bucket|blob|object-?store/, "storage", false],
  [
    /keycloak|oauth|oidc|\bidp\b|\bdex\b|authelia|authentik|\bauth\b/,
    "auth",
    false,
  ],
  [/smtp|mail|sendgrid|mailgun|postmark|\bses\b/, "mail", false],
  [
    /nginx|envoy|traefik|haproxy|ingress|gateway|proxy|frontend|\bweb\b/,
    "web",
    false,
  ],
];

/** The glyph for a node: a name rule where one fits, else its kind's. */
export function iconFor(id: string, kind: NodeKind): IconName {
  if (kind === "user") return kind;
  const name = id.toLowerCase();
  const infra = kind === "database" || kind === "messaging";
  for (const [pattern, icon, forInfra] of NAME_RULES) {
    if ((!infra || forInfra) && pattern.test(name)) return icon;
  }
  return kind;
}

export interface IconStyle {
  /** Disc colour. */
  fill: string;
  /** Ring colour; none when undefined. */
  ring?: string;
  /** Ring width in px at a 48 px icon. */
  ringWidth?: number;
  dashed?: boolean;
}

const cache = new Map<string, string>();

/** The icon as a `data:` URL. */
export function iconDataUrl(kind: IconName, style: IconStyle): string {
  const key = `${kind}|${style.fill}|${style.ring ?? ""}|${style.ringWidth ?? 0}|${style.dashed ? 1 : 0}`;
  let url = cache.get(key);
  if (!url) {
    const w = style.ring ? (style.ringWidth ?? 3) : 0;
    const ring = style.ring
      ? ` stroke="${style.ring}" stroke-width="${w}"${style.dashed ? ' stroke-dasharray="5 3.5"' : ""}`
      : "";
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">` +
      `<circle cx="24" cy="24" r="${23 - w / 2}" fill="${style.fill}"${ring}/>` +
      `<path transform="translate(11 11) scale(1.083)" d="${GLYPHS[kind]}" fill="none" stroke="#fff" ` +
      `stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>` +
      `</svg>`;
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    cache.set(key, url);
  }
  return url;
}
