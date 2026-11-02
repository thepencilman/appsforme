import { createHash } from 'node:crypto';
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', parseTagValue: false, trimValues: true, processEntities: false });

const SERIOUS = new RegExp('\\b(' + [
  'trump','biden','harris','vance','obama','musk','putin','netanyahu','zelensk\\w*','congress','senate','senator','republicans?','democrats?','gop','white house','supreme court','election\\w*','ballot','midterms?','impeach\\w*','tariffs?','immigration','ice agents?','deport\\w*','pentagon','nato','sanctions?',
  '(?<!star )wars?','warfare','gaza','israel\\w*','palestin\\w*','hamas','hezbollah','ukrain\\w*','russia\\w*','iran\\w*','airstrikes?','missiles?','invasion','troops','terror\\w*',
  'shooting','shooter','murder\\w*','homicide','(?:were|was|people|dead|\\d+) killed','stabb\\w*','massacre','genocide','rape\\w*','assault\\w*','abuse\\w*','suicide','overdose','gulag',
  'lawsuit','sued','indict\\w*','layoffs?','recession','inflation','stock market','pandemic','outbreak','cancer'
].join('|') + ')\\b', 'i');
const JUNK = /\b(sponsored|black friday|cyber monday|prime day|best deals?|deals? (on|of)|\d+% off|on sale|save \$?\d+|coupon|giveaway|promo code|podcast episode|supporter rewards)\b/i;

export const isBlocked = (title, summary = '') => SERIOUS.test(title) || SERIOUS.test(summary.slice(0, 160)) || JUNK.test(title);

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export function decode(s) {
  return String(s).replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const c = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(c); } catch { return ''; }
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}
const unCdata = s => String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
export function text(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === 'object') return text(v['#text'] ?? '');
  return unCdata(v);
}
export function plain(html) {
  let s = text(html);
  for (let i = 0; i < 2; i++) s = decode(s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '));
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
export function clip(s, n = 220) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (stop > n * 0.55) return cut.slice(0, stop + 1);
  return cut.slice(0, cut.lastIndexOf(' ')).replace(/[,;:\s]+$/, '') + '…';
}
export function cleanUrl(u) {
  try {
    const x = new URL(decode(text(u)).trim());
    if (!/^https?:$/.test(x.protocol)) return '';
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid|gclid|mc_|ref$|source$)/i.test(k)) x.searchParams.delete(k);
    x.hash = '';
    return x.href;
  } catch { return ''; }
}
export function unwrapBing(u) {
  try {
    const x = new URL(u);
    if (/(^|\.)bing\.com$/.test(x.hostname) && x.searchParams.get('url')) return x.searchParams.get('url');
  } catch {}
  return u;
}
export function goodImage(u) {
  const c = cleanUrl(u);
  if (!c) return '';
  if (/(gravatar|feedburner|pixel|tracking|spacer|blank\.|1x1|emoji|\.svg|\.gif)(\b|$|\?)/i.test(c)) return '';
  return c.replace(/^http:/, 'https:');
}
const arr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
function imageOf(it, html) {
  for (const k of ['media:content', 'media:thumbnail', 'enclosure', 'media:group']) {
    for (const m of arr(it[k])) {
      const nested = k === 'media:group' ? [...arr(m['media:content']), ...arr(m['media:thumbnail'])] : [m];
      for (const n of nested) {
        const type = n['@type'] || n['@medium'] || '';
        if (k === 'enclosure' && !/image/i.test(type)) continue;
        if (type && !/image/i.test(type)) continue;
        const g = goodImage(n['@url'] || '');
        if (g) return g;
      }
    }
  }
  for (const m of decode(html).matchAll(/<img[^>]+?src=["']([^"']+)["']/gi)) {
    const g = goodImage(m[1]);
    if (g) return g;
  }
  return '';
}
function atomLink(it) {
  const links = arr(it.link);
  const pick = links.find(l => l && typeof l === 'object' && (!l['@rel'] || l['@rel'] === 'alternate') && l['@href']) || links.find(l => l && l['@href']);
  return pick ? pick['@href'] : text(it.link);
}
export const idFor = url => createHash('sha1').update(url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')).digest('hex').slice(0, 12);

export function parseFeed(xml, feed) {
  const doc = parser.parse(xml);
  const rss = doc.rss?.channel ?? doc.channel;
  const rdf = doc['rdf:RDF'];
  const raw = rss ? arr(rss.item) : rdf ? arr(rdf.item) : arr(doc.feed?.entry);
  if (!rss && !rdf && !doc.feed) throw new Error('not a feed');
  const out = [];
  for (const it of raw) {
    const title = plain(it.title);
    const rawUrl = rss || rdf ? (text(it.link) || (it.guid?.['@isPermaLink'] !== 'false' ? text(it.guid) : '')) : atomLink(it);
    const url = cleanUrl(unwrapBing(decode(rawUrl)));
    if (!title || !url) continue;
    const body = text(it['content:encoded'] ?? it.content ?? '');
    const desc = text(it.description ?? it.summary ?? '');
    const when = Date.parse(text(it.pubDate ?? it['dc:date'] ?? it.published ?? it.updated ?? ''));
    let summary = plain(desc || body).replace(/\s*(The post|Read more|Continue reading|Article URL:)[\s\S]*$/i, '').trim();
    if (summary.toLowerCase().startsWith(title.toLowerCase())) summary = summary.slice(title.length).replace(/^[\s:.–—-]+/, '');
    out.push({
      id: idFor(url), title: clip(title, 180), url, source: plain(it['News:Source'] ?? '') || feed.name, cat: feed.cat,
      date: Number.isNaN(when) ? null : new Date(Math.min(when, Date.now())).toISOString(),
      summary: clip(summary), image: imageOf(it, body + ' ' + desc),
      ...(feed.evergreen ? { evergreen: true } : {}),
      ...(feed.allowSerious ? { allowSerious: true } : {})
    });
  }
  return out;
}
export const titleKey = t => t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
export function ogImage(html) {
  const m = html.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)(?::src)?["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  return m ? goodImage(m[1]) : '';
}
