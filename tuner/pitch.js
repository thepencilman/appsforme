// YIN pitch detector, tuned for guitar and bass (down to a 5-string low B, ~31 Hz).
// Pure function so it can be tested outside the browser.

let scratch = { x: null, d: null, raw: null };

export function detectPitch(buf, sampleRate, { minFreq = 27, maxFreq = 1500, threshold = 0.12 } = {}) {
  // Halve the rate when it's high: fundamentals we care about are all well under 2 kHz,
  // and it cuts the O(n·tau) work by ~4x.
  const D = sampleRate > 30000 ? 2 : 1;
  const sr = sampleRate / D;
  const n = Math.floor(buf.length / D);
  if (!scratch.x || scratch.x.length !== n) scratch.x = new Float32Array(n);
  const x = scratch.x;

  let mean = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < D; k++) s += buf[i * D + k];
    x[i] = s / D;
    mean += x[i];
  }
  mean /= n;
  // Two-pass one-pole low-pass: strips mic hiss above the instrument range, which is
  // what otherwise jitters the period estimate.
  const fc = Math.min(maxFreq * 2, sr / 4);
  const alpha = 1 - Math.exp(-2 * Math.PI * fc / sr);
  for (let pass = 0; pass < 2; pass++) {
    let y = pass ? x[0] : x[0] - mean;
    for (let i = 0; i < n; i++) {
      y += alpha * ((pass ? x[i] : x[i] - mean) - y);
      x[i] = y;
    }
  }
  mean = 0;
  for (let i = 0; i < n; i++) mean += x[i];
  mean /= n;
  let energy = 0;
  for (let i = 0; i < n; i++) { x[i] -= mean; energy += x[i] * x[i]; }
  const rms = Math.sqrt(energy / n);

  const tauMin = Math.max(2, Math.floor(sr / maxFreq));
  const tauMax = Math.min(Math.ceil(sr / minFreq), Math.floor(n / 2));
  const W = n - tauMax - 1;
  if (rms < 1e-5 || tauMax <= tauMin + 2) return { freq: 0, clarity: 0, rms };

  if (!scratch.d || scratch.d.length !== tauMax + 2) scratch.d = new Float32Array(tauMax + 2);
  const d = scratch.d;
  if (!scratch.raw || scratch.raw.length !== tauMax + 2) scratch.raw = new Float32Array(tauMax + 2);
  const raw = scratch.raw;

  // Difference function.
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) { const v = x[j] - x[j + tau]; sum += v * v; }
    d[tau] = sum;
    raw[tau] = sum;
  }
  // Cumulative mean normalised difference.
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax + 1; tau++) {
    running += d[tau];
    d[tau] = running > 0 ? d[tau] * tau / running : 1;
  }

  // First dip under the threshold, then walk down to its bottom.
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) {
    // No clean dip; accept the global minimum only if it's reasonably periodic.
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) if (d[t] < d[best]) best = t;
    if (d[best] > 0.3) return { freq: 0, clarity: 1 - d[best], rms };
    tau = best;
  }

  // Parabolic interpolation on the raw difference (less biased than on the normalised curve).
  let better = tau;
  if (tau > 1 && tau < tauMax + 1) {
    const a = raw[tau - 1], b = raw[tau], c = raw[tau + 1];
    const den = a + c - 2 * b;
    if (den > 0) better = tau + 0.5 * (a - c) / den;
  }
  return { freq: sr / better, clarity: 1 - d[tau], rms };
}

export function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
