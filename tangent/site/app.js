'use strict';
const CATS = {
  local: 'Local', weird: 'Weird', science: 'Science', space: 'Space', nature: 'Nature', history: 'History',
  music: 'Music tech', tech: 'Makers', art: 'Art', games: 'Games'
};
const LEVELS = [['Off', 0], ['Less', .5], ['Normal', 1], ['More', 2]];
const DEFAULT_DIALS = { weird: 2, music: 2, followed: 2 };
const SERIOUS = /\b(trump|biden|election|senate|congress|tariffs?|gaza|ukraine|putin|shooting|murder|lawsuit|layoffs?)\b/i;
const STOP = new Set('about after again against their there these those which while where would could should other first scientists researchers study finds found discover discovered reveals revealed review update first years year people world might still using inside under never every being new'.split(' '));
const $ = id => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('tangent.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tangent.' + k, JSON.stringify(v)); } catch {} }
};
const S = {
  dials: { ...DEFAULT_DIALS, ...store.get('dials', {}) },
  words: store.get('words', {}),
  sources: store.get('sources', {}),
  hiddenSources: store.get('hiddenSources', []),
  hiddenItems: store.get('hiddenItems', []),
  saved: store.get('saved', {}),
  seen: store.get('seen', []),
  liked: store.get('liked', []),
  mute: store.get('mute', ''),
  serious: store.get('serious', true),
  interests: store.get('interests', []),
  followed: store.get('followed', {})
};
let data = { items: [], feeds: [] }, liveItems = new Map(), search = null, view = 'all', queue = [], shown = 0, dividerDone = false;
const seenSet = new Set(S.seen);
const sessionSeen = new Set(S.seen);

const save = (...keys) => keys.forEach(k => store.set(k, S[k]));
const tokens = t => [...new Set(t.toLowerCase().match(/[a-z][a-z0-9-]{3,}/g) || [])].filter(w => !STOP.has(w));
const dial = c => S.dials[c] ?? 1;
const muteList = () => S.mute.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);

function allowed(x) {
  if (S.hiddenItems.includes(x.id) || S.hiddenSources.includes(x.source)) return false;
  const text = (x.title + ' ' + (x.summary || '')).toLowerCase();
  if (muteList().some(w => text.includes(w))) return false;
  return x.cat === 'local' || x.cat === 'followed' || !(S.serious && SERIOUS.test(x.title));
}
function score(x, now) {
  const hours = Math.max(0, (now - Date.parse(x.firstSeen || x.date)) / 36e5);
  const fresh = x.evergreen ? Math.max(.45, Math.pow(.5, hours / 72)) : Math.pow(.5, hours / 36);
  const taste = tokens(x.title).reduce((n, w) => n + (S.words[w] || 0), 0);
  const tasteMul = Math.min(1.8, Math.max(.4, 1 + taste * .12));
  const pic = x.image ? 1.15 : 1;
  const jitter = .85 + .3 * (parseInt(x.id.slice(0, 4), 16) / 65535);
  return dial(x.cat) * (S.sources[x.source] ?? 1) * tasteMul * fresh * pic * jitter;
}
function spread(list) { // keeps one source or topic from taking over the screen
  const pool = [...list], out = [];
  while (pool.length) {
    const recent = out.slice(-5);
    let i = pool.findIndex(x => !recent.some(r => r.source === x.source) && out.at(-1)?.cat !== x.cat);
    if (i < 0 || i > 40) i = pool.findIndex(x => out.at(-1)?.source !== x.source);
    if (i < 0) i = 0;
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
const followedItems = () => S.interests.flatMap(t => S.followed[t]?.items || []);
function allItems() {
  const seen = new Set(data.items.map(x => x.id)), titles = new Set(data.items.map(x => x.title.toLowerCase()));
  const extra = followedItems().filter(x => {
    const k = x.title.toLowerCase();
    if (seen.has(x.id) || titles.has(k)) return false;
    seen.add(x.id); titles.add(k); return true;
  });
  return data.items.concat(extra);
}
function rank() {
  const now = Date.now();
  const scored = list => spread(list.sort((a, b) => score(b, now) - score(a, now)));
  let list = allItems().filter(allowed);
  if (view === 'saved') return Object.values(S.saved).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
  if (view !== 'all') list = list.filter(x => x.cat === view);
  else list = list.filter(x => dial(x.cat) > 0);
  const unseen = list.filter(x => !sessionSeen.has(x.id)), seen = list.filter(x => sessionSeen.has(x.id));
  const a = scored(unseen), b = spread(seen.sort((p, q) => Date.parse(q.date) - Date.parse(p.date)));
  if (a.length && b.length) a.push({ divider: true, count: b.length });
  return a.concat(b);
}
const ago = iso => {
  const m = (Date.now() - Date.parse(iso)) / 6e4;
  if (!(m >= 0)) return '';
  if (m < 60) return Math.max(1, Math.round(m)) + 'm';
  if (m < 1440) return Math.round(m / 60) + 'h';
  if (m < 43200) return Math.round(m / 1440) + 'd';
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const ICON = {
  more: '<path d="M12 5v14M5 12h14"/>',
  less: '<path d="M5 12h14"/>',
  save: '<path d="M6 4h12v16l-6-4-6 4z"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 13v7h14v-7"/>'
};
function act(name, label, pressed) {
  const b = document.createElement('button');
  b.dataset.act = name;
  if (pressed != null) b.setAttribute('aria-pressed', pressed);
  b.setAttribute('aria-label', label);
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
  const s = document.createElement('span'); s.textContent = label; b.append(s);
  return b;
}
function card(x) {
  const el = document.createElement('article');
  el.className = 'card'; el.dataset.id = x.id;
  el.style.setProperty('--c', `var(--${x.cat})`);
  const usePhoto = !!x.image;
  if (!usePhoto) el.classList.add('poster');
  const a = document.createElement('a');
  a.className = 'hit'; a.href = x.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
  if (usePhoto) {
    const img = new Image();
    img.className = 'photo'; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
    img.addEventListener('error', () => { img.remove(); el.classList.add('poster'); });
    img.src = x.image;
    a.append(img);
  }
  const copy = document.createElement('div'); copy.className = 'copy';
  const meta = document.createElement('div'); meta.className = 'meta';
  const src = document.createElement('span'); src.textContent = x.source;
  const when = document.createElement('time'); when.textContent = ago(x.date); when.dateTime = x.date;
  meta.append(document.createElement('i'), src, when);
  const h = document.createElement('h2'); h.className = 'title'; h.textContent = x.title;
  copy.append(meta, h);
  if (x.summary) { const p = document.createElement('p'); p.className = 'sum'; p.textContent = x.summary; copy.append(p); }
  a.append(copy);
  const acts = document.createElement('div'); acts.className = 'acts';
  acts.append(act('more', 'More', S.liked.includes(x.id)), act('less', 'Less'), act('save', 'Save', !!S.saved[x.id]), act('share', 'Share'));
  el.append(a, acts);
  return el;
}
function divider(n) {
  const d = document.createElement('div'); d.className = 'divider';
  const b = document.createElement('b'); b.textContent = "You've seen all the new stuff";
  d.append(b, `${n} older ${n === 1 ? 'story' : 'stories'} below. More arrive every two hours.`);
  return d;
}
function empty() {
  const d = document.createElement('div'); d.className = 'empty';
  const b = document.createElement('b');
  if (view === 'saved') { b.textContent = 'Nothing saved yet'; d.append(b, 'Tap Save on a story to keep it here.'); return d; }
  b.textContent = 'No stories here'; d.append(b, 'Turn this topic up or remove some muted words.');
  const t = document.createElement('button'); t.textContent = 'Tune your feed'; t.onclick = openSheet; d.append(document.createElement('br'), t);
  return d;
}
function more() {
  const end = Math.min(shown + 15, queue.length), f = document.createDocumentFragment();
  for (; shown < end; shown++) {
    const x = queue[shown];
    if (x.divider) { f.append(divider(x.count)); continue; }
    const c = card(x); f.append(c); watcher.observe(c);
  }
  $('feed').append(f);
}
function render(scroll) {
  queue = rank(); shown = 0;
  $('feed').replaceChildren();
  if (!queue.length) $('feed').append(empty());
  more();
  if (scroll) window.scrollTo(0, 0);
}
function chips() {
  const box = $('chips'); box.replaceChildren();
  const add = (v, label) => {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = label; b.setAttribute('aria-pressed', view === v);
    if (CATS[v] || v === 'followed') { b.dataset.v = v; b.style.setProperty('--c', `var(--${v})`); }
    b.onclick = () => { view = v; store.set('view', v); chips(); render(true); };
    box.append(b);
  };
  add('all', 'For you');
  add('local', 'Local');
  if (S.interests.length) add('followed', 'Following');
  Object.entries(CATS).filter(([k]) => k !== 'local').forEach(([k, v]) => add(k, v));
  add('saved', 'Saved');
}
const timers = new Map();
const watcher = new IntersectionObserver(es => {
  for (const e of es) {
    const id = e.target.dataset.id;
    if (e.isIntersecting) timers.set(id, setTimeout(() => { markSeen(id); watcher.unobserve(e.target); }, 900));
    else { clearTimeout(timers.get(id)); timers.delete(id); }
  }
}, { threshold: .6 });
function markSeen(id) {
  if (seenSet.has(id)) return;
  seenSet.add(id); S.seen.push(id);
  if (S.seen.length > 4000) S.seen = S.seen.slice(-3000);
  save('seen');
}
new IntersectionObserver(e => { if (e[0].isIntersecting && shown < queue.length) more(); }, { rootMargin: '1400px' }).observe($('sentinel'));

function toast(msg, label, fn) {
  const t = $('toast'); t.replaceChildren(msg); t.hidden = false;
  (Array.isArray(label) ? label : label ? [[label, fn]] : []).forEach(([l, f]) => {
    const b = document.createElement('button'); b.textContent = l;
    b.onclick = () => { t.hidden = true; f(); }; t.append(b);
  });
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 6000);
}
function teach(x, dir) {
  S.sources[x.source] = Math.min(2.5, Math.max(.3, (S.sources[x.source] ?? 1) * (dir > 0 ? 1.2 : .82)));
  for (const w of tokens(x.title)) S.words[w] = Math.max(-4, Math.min(5, (S.words[w] || 0) + dir));
  save('sources', 'words');
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const el = b.closest('.card'), id = el.dataset.id;
  const x = allItems().find(i => i.id === id) || liveItems.get(id) || S.saved[id];
  if (!x) return;
  const name = b.dataset.act;
  if (name === 'more') {
    const on = b.getAttribute('aria-pressed') !== 'true';
    b.setAttribute('aria-pressed', on);
    if (on) { S.liked.push(id); teach(x, 1); toast('Got it. More like this.'); }
    else { S.liked = S.liked.filter(i => i !== id); teach(x, -1); }
    save('liked');
  } else if (name === 'less') {
    const prev = { sources: { ...S.sources }, words: { ...S.words } };
    teach(x, -1); S.hiddenItems.push(id); save('hiddenItems');
    el.hidden = true;
    toast('Less like this.', [
      ['Undo', () => { S.sources = prev.sources; S.words = prev.words; S.hiddenItems = S.hiddenItems.filter(i => i !== id); save('sources', 'words', 'hiddenItems'); el.hidden = false; }],
      [`Hide ${x.source}`, () => { S.hiddenSources.push(x.source); save('hiddenSources'); render(); }]
    ]);
  } else if (name === 'save') {
    const on = !S.saved[id];
    if (on) S.saved[id] = { ...x, savedAt: Date.now() }; else delete S.saved[id];
    b.setAttribute('aria-pressed', on); save('saved');
    if (!on && view === 'saved') el.remove();
    toast(on ? 'Saved.' : 'Removed from Saved.');
  } else if (name === 'share') {
    try {
      if (navigator.share) await navigator.share({ title: x.title, url: x.url });
      else { await navigator.clipboard.writeText(x.url); toast('Link copied.'); }
    } catch (err) { if (err.name !== 'AbortError') toast('Your browser blocked sharing.'); }
  }
});

let last;
function openSheet() {
  last = document.activeElement; dials(); mutedList(); interestList(); health();
  $('serious').checked = S.serious; $('mute').value = S.mute;
  $('scrim').hidden = $('sheet').hidden = false; document.body.classList.add('locked'); $('close').focus();
}
function closeSheet() {
  $('scrim').hidden = $('sheet').hidden = true; document.body.classList.remove('locked');
  last?.focus(); if (inSearch()) renderSearch(); else render();
}
function dials() {
  $('dials').replaceChildren(...Object.entries(CATS).map(([k, label]) => {
    const row = document.createElement('div'); row.className = 'dial'; row.style.setProperty('--c', `var(--${k})`);
    const n = document.createElement('span'); n.append(document.createElement('i'), label);
    const seg = document.createElement('div'); seg.className = 'seg'; seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', label);
    LEVELS.forEach(([t, v]) => {
      const b = document.createElement('button'); b.textContent = t; b.setAttribute('aria-pressed', dial(k) === v);
      b.onclick = () => { S.dials[k] = v; save('dials'); dials(); };
      seg.append(b);
    });
    row.append(n, seg); return row;
  }));
}
function mutedList() {
  const box = $('muted');
  if (!S.hiddenSources.length) { box.textContent = 'None. Tap Less on a story to hide its source.'; return; }
  box.replaceChildren(...S.hiddenSources.map(s => {
    const b = document.createElement('button'); b.textContent = `${s} ×`; b.setAttribute('aria-label', `Show ${s} again`);
    b.onclick = () => { S.hiddenSources = S.hiddenSources.filter(i => i !== s); save('hiddenSources'); mutedList(); };
    return b;
  }));
}
function interestList() {
  const box = $('interests');
  if (!S.interests.length) { box.textContent = 'None yet. Search for something and tap Follow.'; return; }
  box.replaceChildren(...S.interests.map(t => {
    const b = document.createElement('button'); b.textContent = `${t} ×`; b.setAttribute('aria-label', `Stop following ${t}`);
    b.onclick = () => { unfollow(t); interestList(); };
    return b;
  }));
}
function health() {
  const f = data.feeds || [], ok = f.filter(x => x.ok).length;
  $('health-sum').textContent = f.length ? `Sources: ${ok} of ${f.length} working` : 'Sources: first update still to come';
  $('health').replaceChildren(...f.map(x => {
    const li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('span');
    a.textContent = x.name; b.textContent = x.ok ? `${x.kept} stories` : 'not responding'; if (!x.ok) b.className = 'bad';
    li.append(a, b); return li;
  }));
}
// Live news search. Bing News comes through a free relay; Google News and Hacker News are the backups.
const RELAY = 'https://api.rss2json.com/v1/api.json?rss_url=';
const hashId = s => { let h = 5381; for (const c of s) h = (h * 33 ^ c.charCodeAt(0)) >>> 0; return 'x' + h.toString(16); };
const strip = s => (new DOMParser().parseFromString(String(s || ''), 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim();
const webUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href.replace(/^http:/, 'https:') : ''; } catch { return ''; } };
function unwrap(u) { try { const x = new URL(u); return x.hostname.endsWith('bing.com') && x.searchParams.get('url') || u; } catch { return u; } }
const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'Web'; } };
const article = (q, title, url, date, summary, source) => ({
  id: hashId(url), title, url, source, cat: 'followed', interest: q, summary: (summary || '').slice(0, 220),
  image: '', date: new Date(date).toISOString(), firstSeen: new Date(date).toISOString()
});
const timed = (url, ms = 9000) => fetch(url, { signal: AbortSignal.timeout(ms) }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
async function relay(rss, map) {
  const d = await timed(RELAY + encodeURIComponent(rss));
  if (d.status !== 'ok' || !d.items?.length) throw new Error('no results');
  return d.items.map(map).filter(Boolean);
}
const validDate = s => { const t = Date.parse(String(s).replace(' ', 'T') + 'Z'); return Number.isNaN(t) ? Date.now() : Math.min(t, Date.now()); };
const fromBing = q => relay(`https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss`, i => {
  const url = webUrl(unwrap(i.link)); return url && article(q, strip(i.title), url, validDate(i.pubDate), strip(i.description), host(url));
});
const fromGoogle = q => relay(`https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`, i => {
  const url = webUrl(i.link), m = strip(i.title).match(/^(.*) - ([^-]+)$/);
  return url && article(q, m ? m[1] : strip(i.title), url, validDate(i.pubDate), '', m ? m[2] : 'Google News');
});
const fromHN = async q => {
  const d = await timed(`https://hn.algolia.com/api/v1/search_by_date?query=${encodeURIComponent(q)}&tags=story&numericFilters=points>5&hitsPerPage=15`);
  return d.hits.filter(h => h.url).map(h => article(q, h.title, webUrl(h.url), h.created_at, '', host(h.url)));
};
async function liveSearch(q) {
  for (const f of [fromBing, fromGoogle, fromHN]) {
    try {
      const a = await f(q);
      if (a.length) return a.sort((x, y) => Date.parse(y.date) - Date.parse(x.date));
    } catch {}
  }
  throw new Error('search unavailable');
}
function sectionLabel(t) { const p = document.createElement('p'); p.className = 'label'; p.textContent = t; return p; }
function note(t) { const p = document.createElement('p'); p.className = 'note'; p.textContent = t; return p; }
function renderSearch() {
  const box = $('feed'); box.replaceChildren();
  if (!search?.q) {
    const d = document.createElement('div'); d.className = 'search-head';
    const h = document.createElement('h2'); h.textContent = 'Find a new interest'; d.append(h);
    d.append(note(S.interests.length ? 'Follow a search to keep its stories in your feed.' : 'Search for anything, then tap Follow to keep it in your feed.'));
    if (S.interests.length) {
      const t = document.createElement('div'); t.className = 'terms';
      S.interests.forEach(i => { const b = document.createElement('button'); b.textContent = i; b.onclick = () => { $('q').value = i; runSearch(i, true); }; t.append(b); });
      d.append(t);
    }
    box.append(d); return;
  }
  const head = document.createElement('div'); head.className = 'search-head';
  const h = document.createElement('h2'); h.textContent = search.q;
  const on = S.interests.includes(search.q);
  const f = document.createElement('button'); f.className = 'follow'; f.textContent = on ? 'Following' : 'Follow'; f.setAttribute('aria-pressed', on);
  f.onclick = () => { if (S.interests.includes(search.q)) unfollow(search.q); else follow(search.q); renderSearch(); };
  head.append(h, f); box.append(head);
  if (search.local.length) { box.append(sectionLabel(`IN YOUR FEED (${search.local.length})`)); search.local.slice(0, 8).forEach(x => box.append(card(x))); }
  box.append(sectionLabel('ACROSS THE WEB'));
  if (search.loading) box.append(note('Searching…'));
  else if (search.failed) box.append(note("Web search isn't responding. Try again in a minute."));
  else if (!search.live.length) box.append(note('No stories found. Try fewer or different words.'));
  else search.live.filter(x => !search.local.some(l => l.id === x.id)).slice(0, 25).forEach(x => box.append(card(x)));
}
let searchRun = 0;
async function runSearch(raw, live) {
  const q = raw.trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!q) { search = null; renderSearch(); return; }
  const parts = q.toLowerCase().split(' ');
  const local = allItems().filter(x => { const t = (x.title + ' ' + (x.summary || '')).toLowerCase(); return parts.every(p => t.includes(p)); });
  search = { q, local, live: search?.q === q ? search.live : [], loading: live, failed: false };
  renderSearch();
  if (!live) return;
  const run = ++searchRun;
  try { const a = await liveSearch(q); if (run !== searchRun) return; a.forEach(x => liveItems.set(x.id, x)); search = { ...search, live: a, loading: false }; }
  catch { if (run !== searchRun) return; search = { ...search, loading: false, failed: true }; }
  renderSearch();
}
function openSearch() {
  document.body.classList.add('searching'); $('find').hidden = false; $('fresh').hidden = true;
  renderSearch(); $('q').focus(); window.scrollTo(0, 0);
}
function closeSearch() {
  document.body.classList.remove('searching'); $('find').hidden = true; $('q').value = ''; search = null; searchRun++; render(true);
}
const inSearch = () => !$('find').hidden;
function follow(term) {
  if (S.interests.includes(term)) return;
  S.interests.push(term);
  for (const w of tokens(term)) S.words[w] = Math.min(5, (S.words[w] || 0) + 3);
  const items = search?.q === term ? search.live.filter(x => Date.now() - Date.parse(x.date) < 2592e6) : [];
  S.followed[term] = { at: items.length ? Date.now() : 0, items: items.slice(0, 20) };
  save('interests', 'words', 'followed'); chips(); toast(`Following ${term}.`);
  if (!items.length) refreshInterests();
}
function unfollow(term) {
  S.interests = S.interests.filter(t => t !== term); delete S.followed[term];
  for (const w of tokens(term)) S.words[w] = Math.max(0, (S.words[w] || 0) - 3);
  save('interests', 'words', 'followed'); if (view === 'followed') view = 'all'; chips();
}
let refreshing = false;
async function refreshInterests(pulled) {
  if (refreshing) return; refreshing = true;
  const old = new Set(followedItems().map(x => x.id)); let added = false;
  for (const t of [...S.interests]) {
    if (Date.now() - (S.followed[t]?.at || 0) < (pulled ? 6e5 : 2 * 36e5)) continue;
    try {
      const a = await liveSearch(t);
      if (!S.interests.includes(t)) continue;
      S.followed[t] = { at: Date.now(), items: a.filter(x => Date.now() - Date.parse(x.date) < 2592e6).slice(0, 20) };
      added = added || S.followed[t].items.some(x => !old.has(x.id));
      save('followed');
    } catch {}
    await new Promise(r => setTimeout(r, 1200));
  }
  refreshing = false;
  if (added && !inSearch() && !pulled) { if ($('feed').children.length && window.scrollY > 300) $('fresh').hidden = false; else render(); }
}
$('search-btn').onclick = openSearch;
$('find-close').onclick = closeSearch;
$('find').onsubmit = e => { e.preventDefault(); $('q').blur(); runSearch($('q').value, true); };
let typing; $('q').oninput = e => { clearTimeout(typing); typing = setTimeout(() => runSearch(e.target.value, false), 160); };
$('tune').onclick = openSheet; $('close').onclick = closeSheet; $('scrim').onclick = closeSheet;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });
$('serious').onchange = e => { S.serious = e.target.checked; save('serious'); };
$('mute').oninput = e => { S.mute = e.target.value; save('mute'); };
let armed = false;
$('reset').onclick = e => {
  if (!armed) { armed = true; e.target.textContent = 'Tap again to clear your tuning, hidden stories and history. Saved stories stay.'; return; }
  armed = false;
  Object.assign(S, { dials: { ...DEFAULT_DIALS }, words: {}, sources: {}, hiddenSources: [], hiddenItems: [], liked: [], seen: [], mute: '' });
  seenSet.clear(); sessionSeen.clear();
  save('dials', 'words', 'sources', 'hiddenSources', 'hiddenItems', 'liked', 'seen', 'mute');
  e.target.textContent = "Clear everything you've taught it"; $('mute').value = ''; dials(); mutedList(); toast('Tuning cleared.');
};
$('home').onclick = e => { e.preventDefault(); if (inSearch()) closeSearch(); else refreshOrder(); };
function refreshOrder() {
  seenSet.forEach(i => sessionSeen.add(i)); $('fresh').hidden = true; render(true);
}
$('fresh').onclick = refreshOrder;

async function load(first) {
  try {
    const r = await fetch('data/feed.json', { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    const next = await r.json();
    const changed = next.updated !== data.updated;
    const hadData = data.items.length;
    data = next;
    $('updated').textContent = 'updated ' + ago(data.updated) + ' ago';
    if (inSearch()) return true;
    if (first || !hadData) render();
    else if (changed) $('fresh').hidden = false;
    return true;
  } catch {
    if (!first) return false;
    { const d = document.createElement('div'); d.className = 'empty'; const b = document.createElement('b'); b.textContent = "Can't reach your feed"; d.append(b, 'Check your connection and reopen the app.'); $('feed').replaceChildren(d); }
  }
}
view = store.get('view', 'all'); if (!CATS[view] && view !== 'saved' && !(view === 'followed' && S.interests.length)) view = 'all';
chips(); load(true).then(refreshInterests);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { load(false); refreshInterests(); } });
// Pull down from the top to get new stories and any new version of the app.
let worker;
const PULL_AT = 64, pull = { start: null, x: 0, dist: 0, busy: false };
function showPull(dist, text, cls) {
  const el = $('pull');
  el.style.setProperty('--head', document.querySelector('.top').offsetHeight + 'px');
  el.className = 'pull' + (cls ? ' ' + cls : '');
  el.style.transform = `translateY(${dist}px)`;
  el.style.opacity = dist ? Math.min(1, dist / 40) : 0;
  $('pull-text').textContent = text;
}
async function pullRefresh() {
  pull.busy = true;
  showPull(62, 'Checking for new stories…', 'busy');
  const known = new Set(allItems().map(x => x.id));
  const [ok] = await Promise.all([load(false), refreshInterests(true), worker?.update().catch(() => {}), new Promise(r => setTimeout(r, 600))]);
  const added = allItems().filter(x => !known.has(x.id) && allowed(x)).length;
  if (ok) refreshOrder();
  pull.busy = false; showPull(0, '');
  if (!ok) toast("Can't reach your feed. Check your connection and pull again.");
  else toast(added ? `${added} new ${added === 1 ? 'story' : 'stories'}.` : `You're up to date. Stories updated ${ago(data.updated)} ago.`);
}
const atTop = () => window.scrollY <= 0 && !inSearch() && !document.body.classList.contains('locked') && !pull.busy;
addEventListener('touchstart', e => {
  pull.start = atTop() && e.touches.length === 1 ? e.touches[0].clientY : null;
  pull.x = e.touches[0].clientX; pull.dist = 0;
}, { passive: true });
addEventListener('touchmove', e => {
  if (pull.start == null) return;
  const dy = e.touches[0].clientY - pull.start, dx = Math.abs(e.touches[0].clientX - pull.x);
  if (dy <= 0 || dx > dy) { pull.start = null; if (pull.dist) showPull(0, ''); pull.dist = 0; return; }
  e.preventDefault();
  pull.dist = Math.min(110, dy * .5);
  showPull(pull.dist, pull.dist >= PULL_AT ? 'Release to refresh' : 'Pull to refresh', 'dragging');
}, { passive: false });
const endPull = () => {
  if (pull.start == null) return;
  const go = pull.dist >= PULL_AT; pull.start = null; pull.dist = 0;
  if (go) pullRefresh(); else showPull(0, '');
};
addEventListener('touchend', endPull); addEventListener('touchcancel', endPull);
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').then(r => { worker = r; }).catch(() => {}));
