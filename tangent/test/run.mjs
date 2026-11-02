import assert from 'node:assert';
import { parseFeed, isBlocked, ogImage, goodImage, clip, plain } from '../scripts/lib.mjs';
const f = { name: 'T', cat: 'weird' };
const rss = `<?xml version="1.0"?><rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>
<item><title><![CDATA[A &amp; B&#8217;s <em>odd</em> frog]]></title><link>http://ex.com/a?utm_source=x&amp;id=1</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate>
<description><![CDATA[<p>Frogs &amp; more. <img src="https://ex.com/i.jpg"></p><p>The post frog appeared first.</p>]]></description></item>
<item><title>Two</title><guid>https://ex.com/2</guid><media:content url="https://ex.com/m.jpg" medium="image"/><enclosure url="https://ex.com/a.mp3" type="audio/mpeg"/></item>
<item><title>No link</title></item></channel></rss>`;
const a = parseFeed(rss, f);
assert.equal(a.length, 2);
assert.equal(a[0].title, 'A & B’s odd frog');
assert.equal(a[0].url, 'http://ex.com/a?id=1');
assert.equal(a[0].image, 'https://ex.com/i.jpg');
assert.equal(a[0].summary, 'Frogs & more.');
assert.equal(a[1].image, 'https://ex.com/m.jpg');
assert.equal(a[1].date, null);
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">Hi &lt;b&gt;there&lt;/b&gt;</title><link rel="self" href="https://ex.com/self"/><link rel="alternate" href="https://ex.com/post"/><updated>2026-10-01T00:00:00Z</updated><summary>Short</summary></entry></feed>`;
const b = parseFeed(atom, f);
assert.equal(b[0].title, 'Hi there'); assert.equal(b[0].url, 'https://ex.com/post');
assert.throws(() => parseFeed('<html><body>no</body></html>', f));
assert(isBlocked('Trump signs order')); assert(isBlocked('Save 50% off: 30% off synths'));
assert(!isBlocked('Scientists find a warbler in Peru')); assert(!isBlocked('Do spiders dream?'));
assert.equal(ogImage('<meta property="og:image" content="https://x.com/a.png">'), 'https://x.com/a.png');
assert.equal(ogImage('<meta content="https://x.com/b.png" name="twitter:image">'), 'https://x.com/b.png');
assert.equal(goodImage('https://x.com/pixel.gif'), '');
assert.equal(goodImage('javascript:alert(1)'), '');
assert.equal(plain('<script>x</script>&lt;b&gt;ok&lt;/b&gt;'), 'ok');
assert(clip('word '.repeat(100), 50).endsWith('…'));
console.log('all passed');
