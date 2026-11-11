const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('startup uses an original local Web Audio theme with a user sound control', () => {
  assert.match(html, /new AudioContextClass\(\)/);
  assert.match(html, /const notes = \[261\.63, 329\.63, 392\.00/);
  assert.match(html, /id="splash-sound-toggle"/);
  assert.match(html, /pv-boot-sound/);
  assert.match(html, /stopPlayverseBootMusic/);
  assert.doesNotMatch(html, /<audio[^>]+autoplay/i);
});

test('startup progress begins visibly and cannot report 100 percent before session restoration', () => {
  assert.match(html, /currentProgress = 1/);
  assert.match(html, /id="splash-percent"/);
  assert.match(html, /aria-valuemax="100"/);
  assert.match(html, /Math\.min\(92,/);
  assert.match(html, /const restored = await restoreSession\(\)/);
  assert.match(html, /await Promise\.allSettled\(\[/);
  assert.match(html, /await loadCommunityGameServers\(\)/);
  assert.match(html, /await loadCommunityStories\(\)/);
  assert.match(html, /ready = true;[\s\S]{0,180}clearInterval\(progressTimer\)[\s\S]{0,100}width = '100%'/);
});

test('startup has a bounded cinematic hold and respects reduced motion', () => {
  assert.match(html, /5200 - \(Date\.now\(\) - startedAt\)/);
  assert.match(html, /prefers-reduced-motion:reduce/);
});
