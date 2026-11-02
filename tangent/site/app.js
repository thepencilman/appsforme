'use strict';
const CATS = {
  weird: 'Weird', science: 'Science', space: 'Space', nature: 'Nature', history: 'History',
  music: 'Music tech', tech: 'Makers', art: 'Art', games: 'Games'
};
const LEVELS = [['Off', 0], ['Less', .5], ['Normal', 1], ['More', 2]];
const DEFAULT_DIALS = { weird: 2, music: 2 };
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
  serious: store.get('serious', true)
};
let data = { items: [], feeds: [] }, view = 'all', queue = [], shown = 0, dividerDone = false;
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
  return !(S.serious && SERIOUS.test(x.title));
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
function rank() {
  const now = Date.now();
  const scored = list => spread(list.sort((a, b) => score(b, now) - score(a, now)));
  let list = data.items.filter(allowed);
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
    if (CATS[v]) { b.dataset.v = v; b.style.setProperty('--c', `var(--${v})`); }
    b.onclick = () => { view = v; store.set('view', v); chips(); render(true); };
    box.append(b);
  };
  add('all', 'For you');
  Object.entries(CATS).forEach(([k, v]) => add(k, v));
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
  const x = data.items.find(i => i.id === id) || S.saved[id];
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
  last = document.activeElement; dials(); mutedList(); health();
  $('serious').checked = S.serious; $('mute').value = S.mute;
  $('scrim').hidden = $('sheet').hidden = false; document.body.classList.add('locked'); $('close').focus();
}
function closeSheet() {
  $('scrim').hidden = $('sheet').hidden = true; document.body.classList.remove('locked');
  last?.focus(); render();
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
function health() {
  const f = data.feeds || [], ok = f.filter(x => x.ok).length;
  $('health-sum').textContent = f.length ? `Sources: ${ok} of ${f.length} working` : 'Sources: first update still to come';
  $('health').replaceChildren(...f.map(x => {
    const li = document.createElement('li'), a = document.createElement('span'), b = document.createElement('span');
    a.textContent = x.name; b.textContent = x.ok ? `${x.kept} stories` : 'not responding'; if (!x.ok) b.className = 'bad';
    li.append(a, b); return li;
  }));
}
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
$('home').onclick = e => { e.preventDefault(); refreshOrder(); };
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
    if (first || !hadData) render();
    else if (changed) $('fresh').hidden = false;
  } catch {
    if (first) { const d = document.createElement('div'); d.className = 'empty'; const b = document.createElement('b'); b.textContent = "Can't reach your feed"; d.append(b, 'Check your connection and reopen the app.'); $('feed').replaceChildren(d); }
  }
}
view = store.get('view', 'all'); if (!CATS[view] && view !== 'saved') view = 'all';
chips(); load(true);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(false); });
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
