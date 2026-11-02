// Fetches every feed, filters and merges, then writes site/data/feed.json.
import { readFile, writeFile } from 'node:fs/promises';
import { parseFeed, isBlocked, titleKey, ogImage } from './lib.mjs';

const OUT = new URL('../site/data/feed.json', import.meta.url);
const DAY = 864e5, FRESH_DAYS = 21, EVERGREEN_DAYS = 365, PER_SOURCE = 15, MAX_ITEMS = 700, MAX_OG = 80;
const HEADERS = { 'user-agent': 'Mozilla/5.0 (compatible; TangentReader/1.0; personal feed reader)', accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5' };

const get = async (url, ms = 15000) => {
  const r = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(ms), redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
};
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}

const feeds = JSON.parse(await readFile(new URL('../feeds.json', import.meta.url)));
const prev = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => ({ items: [] }));
const known = new Map(prev.items.map(x => [x.id, x]));
const now = Date.now(), nowIso = new Date(now).toISOString();
const status = [], fresh = [];

await pool(feeds, 8, async feed => {
  try {
    const items = parseFeed(await get(feed.url), feed);
    const kept = items.filter(x => !isBlocked(x.title, x.summary)).slice(0, PER_SOURCE);
    fresh.push(...kept);
    status.push({ name: feed.name, cat: feed.cat, ok: true, found: items.length, kept: kept.length });
  } catch (e) {
    status.push({ name: feed.name, cat: feed.cat, ok: false, error: String(e.message || e).slice(0, 100) });
  }
});

const merged = new Map(known);
for (const x of fresh) {
  const old = known.get(x.id);
  merged.set(x.id, { ...x, date: x.date || old?.date || nowIso, image: x.image || old?.image || '', firstSeen: old?.firstSeen || nowIso });
}
const seenTitles = new Set();
let items = [...merged.values()]
  .filter(x => !isBlocked(x.title, x.summary || ''))
  .filter(x => now - Date.parse(x.date) < (x.evergreen ? EVERGREEN_DAYS : FRESH_DAYS) * DAY)
  .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
  .filter(x => { const k = titleKey(x.title); if (seenTitles.has(k)) return false; seenTitles.add(k); return true; })
  .slice(0, MAX_ITEMS);

const noImage = items.filter(x => !x.image && !x.noOg).slice(0, MAX_OG);
await pool(noImage, 8, async x => {
  try { x.image = ogImage((await get(x.url, 8000)).slice(0, 200000)); } catch {}
  if (!x.image) x.noOg = true;
});

const working = status.filter(s => s.ok).length;
if (!working && prev.items.length) { console.error('Every feed failed. Keeping the previous data.'); process.exit(0); }
status.sort((a, b) => a.name.localeCompare(b.name));
await writeFile(OUT, JSON.stringify({ updated: nowIso, feeds: status, items }));
console.log(`${items.length} stories from ${working}/${feeds.length} feeds`);
for (const s of status.filter(s => !s.ok)) console.log(`FAILED ${s.name}: ${s.error}`);
