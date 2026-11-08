import { detectPitch } from '../pitch.js';
const sr = 48000, N = 8192;
function tone(f, { harm = [1, 0.6, 0.4, 0.25, 0.15], noise = 0.02, amp = 0.3 } = {}) {
  const b = new Float32Array(N), ph = Math.random() * 6;
  for (let i = 0; i < N; i++) {
    let v = 0;
    harm.forEach((h, k) => { v += h * Math.sin(2 * Math.PI * f * (k + 1) * i / sr + ph * (k + 1)); });
    b[i] = amp * v / harm.length + noise * (Math.random() * 2 - 1);
  }
  return b;
}
const cases = [30.87, 41.2, 55, 73.42, 82.41, 98, 110, 146.83, 196, 246.94, 329.63, 440, 659.26, 82.41 * 2 ** (12 / 1200), 110 * 2 ** (-23 / 1200)];
let fail = 0;
for (const f of cases) {
  for (const harm of [[1], [1, 0.6, 0.4, 0.25, 0.15], [0.3, 1, 0.7, 0.5, 0.3]]) {
    const r = detectPitch(tone(f, { harm }), sr, { minFreq: 27, maxFreq: 1500 });
    const cents = 1200 * Math.log2(r.freq / f);
    const ok = Math.abs(cents) < 1.5;
    if (!ok) fail++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${f.toFixed(2).padStart(7)} Hz -> ${r.freq.toFixed(2).padStart(7)} (${cents.toFixed(2)}¢) clarity ${r.clarity.toFixed(2)} harm=${harm.join(',')}`);
  }
}
const silent = detectPitch(new Float32Array(N).map(() => 0.01 * (Math.random() * 2 - 1)), sr);
console.log('noise ->', silent.freq.toFixed(1), 'clarity', silent.clarity.toFixed(2));
const t0 = performance.now(); for (let i = 0; i < 50; i++) detectPitch(tone(82.41), sr); console.log('ms/frame', ((performance.now() - t0) / 50).toFixed(2));
process.exit(fail ? 1 : 0);
