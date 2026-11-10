const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('all inline JavaScript in the main interface parses successfully', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const inlineScripts = scriptTags.filter((match) => !/\bsrc\s*=/i.test(match[1]));

  assert.ok(inlineScripts.length > 0, 'Expected at least one inline application script');
  assert.match(html, /id="community-load-more"/, 'Community feed must expose its pagination control');
  assert.match(html, /\/api\/posts\?before=/, 'Community feed must request subsequent pages with a cursor');
  assert.match(html, /id="tab-friends"/, 'The friends screen must be present');
  assert.match(html, /\/api\/friends\/requests\//, 'The friends interface must call the friend request API');
  assert.match(html, /id="profile-editor-form"/, 'The profile editor must be present');
  assert.match(html, /if \(profileCredits\) profileCredits\.textContent/, 'Legacy credit updates must tolerate the profile economy being disabled');
  assert.match(html, /comment\.authorUsername === appState\.username/, 'Comment edit and delete controls must be restricted to the comment owner in the interface');
  assert.match(html, /encodeURIComponent\\(comment\\.id\\)[\\s\\S]{0,300}method: 'PUT'/, 'Comment editing must call the persistent API');
  assert.match(html, /encodeURIComponent\\(comment\\.id\\)[\\s\\S]{0,300}method: 'DELETE'/, 'Comment deletion must call the persistent API');

  inlineScripts.forEach((match, index) => {
    assert.doesNotThrow(
      () => new vm.Script(match[2], { filename: 'index.html:inline-script-' + (index + 1) }),
      'Inline script ' + (index + 1) + ' must be valid JavaScript'
    );
  });
});
