# Tunemate DT-440

A calculator-style digital tuner for guitar and bass that listens through your phone's mic. Plain HTML/CSS/JS, no build step; deployed to GitHub Pages at `/tuner/` by `.github/workflows/tangent.yml`.

- **ON** starts the mic. Play a string and the display shows the note, frequency and how many cents off you are.
- **MODE** switches between guitar, bass and chromatic. **◀ ▶** pick a tuning (standard, drop D, half step down, DADGAD, open G, 5-string bass and more).
- Tap a **string key** to lock onto that string; **AUTO** goes back to picking the closest string.
- **A4 − / +** set the reference pitch (415–466 Hz, default 440). **TONE** plays the target note.
- Add it to your home screen to use it like an app; it works offline once loaded.

Pitch detection is the YIN algorithm in `pitch.js` (accurate to about a cent, down to a 5-string bass low B). Test it with `node test/pitch.test.mjs`.
