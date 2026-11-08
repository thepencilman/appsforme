import { detectPitch, median } from './pitch.js';

/* ------------------------------------------------------------------ tunings */

const TUNINGS = {
  guitar: [
    ['STANDARD', 'E2 A2 D3 G3 B3 E4'],
    ['DROP D', 'D2 A2 D3 G3 B3 E4'],
    ['HALF STEP DOWN', 'Eb2 Ab2 Db3 Gb3 Bb3 Eb4'],
    ['WHOLE STEP DOWN', 'D2 G2 C3 F3 A3 D4'],
    ['DROP C', 'C2 G2 C3 F3 A3 D4'],
    ['DADGAD', 'D2 A2 D3 G3 A3 D4'],
    ['OPEN G', 'D2 G2 D3 G3 B3 D4'],
    ['OPEN D', 'D2 A2 D3 F#3 A3 D4'],
    ['OPEN E', 'E2 B2 E3 G#3 B3 E4'],
    ['7-STRING', 'B1 E2 A2 D3 G3 B3 E4'],
  ],
  bass: [
    ['4-STRING', 'E1 A1 D2 G2'],
    ['5-STRING', 'B0 E1 A1 D2 G2'],
    ['DROP D', 'D1 A1 D2 G2'],
    ['HALF STEP DOWN', 'Eb1 Ab1 Db2 Gb2'],
    ['6-STRING', 'B0 E1 A1 D2 G2 C3'],
  ],
  chromatic: [['CHROMATIC', 'C3 D3 E3 F3 G3 A3 B3']],
};
const INSTRUMENTS = ['guitar', 'bass', 'chromatic'];
const RANGE = { guitar: [55, 1400], bass: [27, 500], chromatic: [27, 1500] };
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

function parseNote(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  const pc = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { midi: 12 * (+m[3] + 1) + pc, flat: m[2] === 'b', name: m[1] + m[2], octave: +m[3] };
}
function spell(midi, flat) {
  const pc = ((midi % 12) + 12) % 12;
  const name = (flat ? FLAT_NAMES : SHARP_NAMES)[pc];
  return { letter: name[0], acc: name[1] || '', octave: Math.floor(midi / 12) - 1 };
}

/* ---------------------------------------------------------- state & storage */

const state = {
  inst: 'guitar',
  tuning: { guitar: 0, bass: 0, chromatic: 0 },
  a4: 440,
  lock: null,
};
try {
  const saved = JSON.parse(localStorage.getItem('tunemate') || 'null');
  if (saved) {
    if (INSTRUMENTS.includes(saved.inst)) state.inst = saved.inst;
    for (const k of INSTRUMENTS) {
      const i = saved.tuning?.[k];
      if (Number.isInteger(i) && i >= 0 && i < TUNINGS[k].length) state.tuning[k] = i;
    }
    if (saved.a4 >= 415 && saved.a4 <= 466) state.a4 = saved.a4;
  }
} catch {}
function save() {
  try { localStorage.setItem('tunemate', JSON.stringify({ inst: state.inst, tuning: state.tuning, a4: state.a4 })); } catch {}
}
function strings() {
  return TUNINGS[state.inst][state.tuning[state.inst]][1].split(' ').map(parseNote);
}
const freqOf = midi => state.a4 * 2 ** ((midi - 69) / 12);

/* ------------------------------------------------------ seven-segment glyphs */

const GLYPHS = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg',
  '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', A: 'abcefg', B: 'cdefg', b: 'cdefg', C: 'adef', D: 'bcdeg',
  d: 'bcdeg', E: 'adefg', F: 'aefg', G: 'acdef', H: 'bcefg', L: 'def', o: 'cdeg', n: 'ceg', r: 'eg',
  i: 'c', P: 'abefg', U: 'bcdef', t: 'defg', '-': 'g', '+': 'gp', ' ': '',
};
const H = (cy, x1 = 8, x2 = 52) => `${x1},${cy} ${x1 + 5},${cy - 5} ${x2 - 5},${cy - 5} ${x2},${cy} ${x2 - 5},${cy + 5} ${x1 + 5},${cy + 5}`;
const V = (cx, y1, y2) => `${cx},${y1} ${cx + 5},${y1 + 5} ${cx + 5},${y2 - 5} ${cx},${y2} ${cx - 5},${y2 - 5} ${cx - 5},${y1 + 5}`;
const SEGS = {
  a: H(5), g: H(50), d: H(95),
  f: V(5, 7, 48), b: V(55, 7, 48), e: V(5, 52, 93), c: V(55, 52, 93),
};
const NS = 'http://www.w3.org/2000/svg';

function sevenSeg(el, count, { dp = false, plus = false } = {}) {
  const digits = [];
  for (let i = 0; i < count; i++) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', dp ? '-4 -2 80 104' : '-4 -2 70 104');
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', 'skewX(-7) translate(7 0)');
    const parts = {};
    for (const [k, pts] of Object.entries(SEGS)) {
      const p = document.createElementNS(NS, 'polygon');
      p.setAttribute('points', pts);
      p.setAttribute('class', 's');
      g.appendChild(p);
      parts[k] = p;
    }
    if (plus && i === 0) {
      const p = document.createElementNS(NS, 'polygon');
      p.setAttribute('points', V(30, 30, 70));
      p.setAttribute('class', 's');
      g.appendChild(p);
      parts.p = p;
    }
    if (dp) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', '67'); c.setAttribute('cy', '95'); c.setAttribute('r', '5.5');
      c.setAttribute('class', 's');
      g.appendChild(c);
      parts.dp = c;
    }
    svg.appendChild(g);
    el.appendChild(svg);
    digits.push(parts);
  }
  let last = null;
  return function set(str) {
    if (str === last) return;
    last = str;
    // Split into cells; a '.' attaches to the preceding character.
    const cells = [];
    for (const ch of str) {
      if (ch === '.' && cells.length) cells[cells.length - 1].dp = true;
      else cells.push({ ch, dp: false });
    }
    while (cells.length < count) cells.unshift({ ch: ' ', dp: false });
    cells.slice(-count).forEach((cell, i) => {
      const on = GLYPHS[cell.ch] ?? '';
      for (const [k, node] of Object.entries(digits[i])) {
        node.classList.toggle('on', k === 'dp' ? cell.dp : on.includes(k));
      }
    });
  };
}

/* ------------------------------------------------------------------- the UI */

const $ = id => document.getElementById(id);
const lcd = $('lcd');
const setNote = sevenSeg($('d-note'), 1);
const setOct = sevenSeg($('d-oct'), 1);
const setHz = sevenSeg($('d-hz'), 5, { dp: true });
const setCents = sevenSeg($('d-cents'), 3, { plus: true });

const METER_N = 25, METER_C = 12, CENTS_PER_SEG = 50 / METER_C;
const meterEls = [];
for (let i = 0; i < METER_N; i++) {
  const s = document.createElement('i');
  if (i === METER_C) s.className = 'c';
  else if (i % 6 === 0) s.className = 'm';
  $('meter').appendChild(s);
  meterEls.push(s);
}
const sigEls = [...$('sig').children];
const ann = (id, on) => $(id).classList.toggle('on', !!on);
const status = txt => { if ($('status').textContent !== txt) $('status').textContent = txt; };

let stringEls = [];
function renderStrings() {
  const box = $('strings');
  const list = strings();
  box.style.gridTemplateColumns = `repeat(${list.length}, 1fr)`;
  box.innerHTML = '';
  stringEls = list.map((s, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'str-wrap';
    const led = document.createElement('span');
    led.className = 'str-led';
    const key = document.createElement('button');
    key.className = 'key cream';
    const acc = s.name[1] ? `<sup>${s.name[1] === 'b' ? '♭' : '♯'}</sup>` : '';
    const label = state.inst === 'chromatic' ? s.name[0] : `${s.name[0]}${acc}<sub>${s.octave}</sub>`;
    key.innerHTML = label;
    key.setAttribute('aria-label', `${state.inst === 'chromatic' ? 'Note' : 'String'} ${s.name}${state.inst === 'chromatic' ? '' : s.octave}`);
    key.addEventListener('click', () => {
      state.lock = state.lock === i ? null : i;
      resetTracking();
      refreshChrome();
    });
    wrap.append(led, key);
    box.appendChild(wrap);
    return { led, key };
  });
}

function refreshChrome() {
  const [name] = TUNINGS[state.inst][state.tuning[state.inst]];
  const instLabel = { guitar: 'GUITAR', bass: 'BASS', chromatic: 'ANY INSTRUMENT' }[state.inst];
  $('tuning-name').textContent = state.inst === 'chromatic' ? `CHROMATIC · ${instLabel}` : `${instLabel} · ${name}`;
  ann('a-gtr', state.inst === 'guitar');
  ann('a-bass', state.inst === 'bass');
  ann('a-chr', state.inst === 'chromatic');
  ann('a-lock', state.lock !== null);
  $('a-cal').textContent = `A4=${state.a4}`;
  ann('a-cal', true);
  $('k-auto').classList.toggle('lit', state.lock === null);
  stringEls.forEach((s, i) => s.key.classList.toggle('lit', state.lock === i));
  $('hint').textContent = state.inst === 'chromatic'
    ? 'Tap a note to lock onto it · AUTO follows any note'
    : 'Tap a string to lock onto it · AUTO picks the closest';
}

function showIdle(msg) {
  setNote('-'); setOct(' '); setHz('  -.--'); setCents(' --');
  ann('a-sharp', false); ann('a-flat', false);
  ann('a-flatarrow', false); ann('a-sharparrow', false); ann('a-tune', false);
  meterEls.forEach((m, i) => m.classList.toggle('on', on && i === METER_C));
  stringEls.forEach(s => s.led.className = 'str-led');
  $('led').className = 'led';
  status(msg);
}

function showReading({ target, flat, hz, cents, stringIdx }) {
  const sp = spell(target, flat);
  setNote(sp.letter);
  setOct(String(sp.octave));
  ann('a-sharp', sp.acc === '#');
  ann('a-flat', sp.acc === 'b');
  setHz(hz >= 1000 ? hz.toFixed(1) : hz >= 100 ? hz.toFixed(2) : hz.toFixed(2).padStart(5, ' '));

  const c = Math.round(cents);
  if (c > 99) setCents(' Hi');
  else if (c < -99) setCents(' Lo');
  else setCents((c > 0 ? '+' : c < 0 ? '-' : ' ') + String(Math.abs(c)).padStart(2, ' '));

  const pos = Math.round(Math.max(-50, Math.min(50, cents)) / CENTS_PER_SEG);
  meterEls.forEach((m, i) => {
    const k = i - METER_C;
    m.classList.toggle('on', k === 0 || (pos > 0 ? k > 0 && k <= pos : k < 0 && k >= pos));
  });

  const inTune = Math.abs(cents) < 3;
  ann('a-tune', inTune);
  ann('a-flatarrow', !inTune && cents < 0);
  ann('a-sharparrow', !inTune && cents > 0);
  $('led').className = 'led ' + (inTune ? 'green' : 'red');
  status(inTune ? 'IN TUNE ✓' : cents < 0 ? '▲ TUNE UP' : '▼ TUNE DOWN');
  stringEls.forEach((s, i) => s.led.className = 'str-led' + (i === stringIdx ? (inTune ? ' ok' : ' on') : ''));
}

/* ------------------------------------------------------------------- audio */

let ctx = null, analyser = null, stream = null, buf = null, raf = 0, on = false, wakeLock = null;
let toneUntil = 0, toneNode = null;

async function start() {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    await ctx.resume();
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (err) {
    console.warn(err);
    on = false;
    lcd.classList.remove('off');
    setNote('E'); setOct(' '); setHz('  Err'); setCents('   ');
    status(location.protocol === 'https:' || location.hostname === 'localhost' ? 'MIC BLOCKED · CHECK PERMISSIONS' : 'NEEDS HTTPS FOR MIC');
    return;
  }
  const src = ctx.createMediaStreamSource(stream);
  analyser = ctx.createAnalyser();
  analyser.fftSize = 8192;
  src.connect(analyser);
  buf = new Float32Array(analyser.fftSize);
  on = true;
  $('k-on').textContent = 'OFF';
  lcd.classList.remove('off');
  ann('a-mic', true);
  resetTracking();
  showIdle('PLAY A STRING');
  requestWakeLock();
  raf = requestAnimationFrame(loop);
}

function stop() {
  on = false;
  cancelAnimationFrame(raf);
  stream?.getTracks().forEach(t => t.stop());
  stream = null;
  wakeLock?.release().catch(() => {});
  wakeLock = null;
  $('k-on').textContent = 'ON';
  ann('a-mic', false);
  sigEls.forEach(s => s.classList.remove('on'));
  lcd.classList.add('off');
  showIdle('PRESS ON');
}

async function requestWakeLock() {
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && on) { requestWakeLock(); ctx?.resume(); }
});

/* ---------------------------------------------------------------- tracking */

let history = [], lastHeard = 0, lastVoiced = 0, lastRun = 0;
let smoothCents = null, smoothHz = null, currentTarget = null, autoString = null, noiseFloor = 0.002;

function resetTracking() {
  history = []; smoothCents = null; smoothHz = null; currentTarget = null; autoString = null;
}

function loop(now) {
  raf = requestAnimationFrame(loop);
  if (now - lastRun < 40) return;
  lastRun = now;

  if (now < toneUntil) { status('♪ REFERENCE TONE'); return; }

  analyser.getFloatTimeDomainData(buf);
  const [minF, maxF] = RANGE[state.inst];
  const r = detectPitch(buf, ctx.sampleRate, { minFreq: minF, maxFreq: maxF });

  const level = Math.min(5, Math.max(0, Math.round((Math.log10(r.rms + 1e-6) + 3.2) * 2.2)));
  sigEls.forEach((s, i) => s.classList.toggle('on', i < level));

  const gate = Math.max(0.003, noiseFloor * 2.5);
  const voiced = r.freq > 0 && r.clarity > 0.8 && r.rms > gate;
  if (!voiced) noiseFloor += (Math.min(r.rms, 0.05) - noiseFloor) * 0.05;

  if (voiced) {
    if (now - lastVoiced > 250) resetTracking();
    lastVoiced = now;
    history.push(r.freq);
    if (history.length > 5) history.shift();
    const f = median(history);
    // Wait for two agreeing frames before showing anything; kills one-frame blips.
    if (history.length < 2) return;
    lastHeard = now;
    update(f);
  } else if (now - lastHeard > 1600) {
    showIdle(on ? 'PLAY A STRING' : 'PRESS ON');
    lastHeard = Infinity;
  }
}

function update(f) {
  const m = 69 + 12 * Math.log2(f / state.a4);
  let target, flat = false, stringIdx = null;

  if (state.inst === 'chromatic') {
    if (state.lock !== null) {
      const pc = strings()[state.lock].midi % 12;
      target = pc + 12 * Math.round((m - pc) / 12);
    } else {
      target = Math.round(m);
    }
  } else {
    const list = strings();
    if (state.lock !== null) {
      stringIdx = state.lock;
    } else {
      // Nearest string, but only switch away from the current one with a clear margin.
      let best = 0;
      list.forEach((s, i) => { if (Math.abs(m - s.midi) < Math.abs(m - list[best].midi)) best = i; });
      if (autoString !== null && autoString < list.length && best !== autoString
        && Math.abs(m - list[autoString].midi) - Math.abs(m - list[best].midi) < 0.5) best = autoString;
      autoString = best;
      stringIdx = best;
    }
    target = list[stringIdx].midi;
    flat = list[stringIdx].flat;
  }

  if (target !== currentTarget) { smoothCents = null; currentTarget = target; }
  const cents = (m - target) * 100;
  smoothCents = smoothCents === null ? cents : smoothCents + (cents - smoothCents) * 0.35;
  smoothHz = smoothHz === null || Math.abs(1200 * Math.log2(f / smoothHz)) > 50 ? f : smoothHz + (f - smoothHz) * 0.35;
  showReading({ target, flat, hz: smoothHz, cents: smoothCents, stringIdx });
}

/* ---------------------------------------------------------- reference tone */

function playTone() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  ctx.resume();
  if (toneNode) { toneNode.stop(); toneNode = null; toneUntil = 0; return; }
  let midi;
  if (state.inst === 'chromatic') {
    const pc = state.lock !== null ? strings()[state.lock].midi % 12 : currentTarget !== null ? currentTarget % 12 : 9;
    midi = 48 + pc; // octave 3: comfortably audible on a phone speaker
  } else {
    const list = strings();
    midi = list[state.lock ?? autoString ?? 0].midi;
  }
  const f = freqOf(midi);
  // Rich harmonics so low bass notes are still audible on tiny speakers.
  const real = new Float32Array([0, 1, 0.7, 0.5, 0.35, 0.25, 0.15, 0.1]);
  const wave = ctx.createPeriodicWave(real, new Float32Array(real.length));
  const osc = ctx.createOscillator();
  osc.setPeriodicWave(wave);
  osc.frequency.value = f;
  const g = ctx.createGain();
  const t = ctx.currentTime, dur = 2.5;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.25, t + 0.02);
  g.gain.setTargetAtTime(0, t + dur - 0.6, 0.18);
  osc.connect(g).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
  toneNode = osc;
  toneUntil = performance.now() + dur * 1000 + 200;
  osc.onended = () => { if (toneNode === osc) toneNode = null; resetTracking(); };

  const sp = spell(midi, state.inst !== 'chromatic' && strings()[state.lock ?? autoString ?? 0].flat);
  setNote(sp.letter); setOct(String(sp.octave));
  ann('a-sharp', sp.acc === '#'); ann('a-flat', sp.acc === 'b');
  setHz(f >= 100 ? f.toFixed(2) : f.toFixed(2).padStart(5, ' ')); setCents('   ');
  if (!on) status('♪ REFERENCE TONE');
}

/* -------------------------------------------------------------------- keys */

function press(id, fn) {
  $(id).addEventListener('click', fn);
}
press('k-on', () => (on ? stop() : start()));
press('k-mode', () => {
  state.inst = INSTRUMENTS[(INSTRUMENTS.indexOf(state.inst) + 1) % INSTRUMENTS.length];
  state.lock = null; resetTracking(); save(); renderStrings(); refreshChrome();
});
function cycle(dir) {
  const n = TUNINGS[state.inst].length;
  state.tuning[state.inst] = (state.tuning[state.inst] + dir + n) % n;
  state.lock = null; resetTracking(); save(); renderStrings(); refreshChrome();
}
press('k-prev', () => cycle(-1));
press('k-next', () => cycle(1));
function cal(dir) {
  state.a4 = Math.max(415, Math.min(466, state.a4 + dir));
  save(); refreshChrome(); resetTracking();
  if (!on || lastHeard === Infinity) { setHz(state.a4.toFixed(2)); setNote('A'); setOct('4'); status(`CALIBRATE A4 = ${state.a4} Hz`); }
}
press('k-down', () => cal(-1));
press('k-up', () => cal(1));
press('k-tone', playTone);
press('k-auto', () => { state.lock = null; resetTracking(); refreshChrome(); });

/* -------------------------------------------------------------------- boot */

renderStrings();
refreshChrome();
lcd.classList.add('off');
showIdle('PRESS ON');

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
