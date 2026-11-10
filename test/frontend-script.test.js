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
  assert.match(html, /id="room-capacity"/, 'Room creation must let the host choose capacity');
  assert.match(html, /function leaveRoom\(roomId\)/, 'Room members must have a leave action');
  assert.match(html, /function closeRoom\(roomId\)/, 'Room hosts must have a close action');
  assert.match(html, /room\.isOwner === true/, 'Room controls must be based on server-provided ownership');
  assert.match(html, /room\.isMember === true/, 'Room controls must be based on server-provided membership');
  assert.match(html, /id="room-chat-modal"/, 'Multiplayer rooms must expose the chat interface');
  assert.match(html, /function sendRoomMessage\(event\)/, 'The chat interface must send persistent messages');
  assert.match(html, /roomSocket\.on\('receive_message'/, 'The chat interface must receive live room messages');
  assert.match(html, /\/api\/rooms\/[' +]encodeURIComponent\(activeRoomId\)\+['/]messages/, 'The chat interface must load and send messages through the room API');
  assert.match(html, /if \(profileCredits\) profileCredits\.textContent/, 'Legacy credit updates must tolerate the profile economy being disabled');
  assert.match(html, /comment\.authorUsername === appState\.username/, 'Comment edit and delete controls must be restricted to the comment owner in the interface');
  assert.match(html, /encodeURIComponent\(comment\.id\)[\s\S]{0,300}method: 'PUT'/, 'Comment editing must call the persistent API');
  assert.match(html, /encodeURIComponent\(comment\.id\)[\s\S]{0,300}method: 'DELETE'/, 'Comment deletion must call the persistent API');

  inlineScripts.forEach((match, index) => {
    assert.doesNotThrow(
      () => new vm.Script(match[2], { filename: 'index.html:inline-script-' + (index + 1) }),
      'Inline script ' + (index + 1) + ' must be valid JavaScript'
    );
  });
});
