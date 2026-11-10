const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('all inline JavaScript in the main interface parses successfully', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const inlineScripts = scriptTags.filter((match) => !/\bsrc\s*=/i.test(match[1]));

  assert.ok(inlineScripts.length > 0, 'Expected at least one inline application script');
  assert.match(html, /href="\/styles\.css"/, 'Production UI must load compiled local Tailwind styles');
  assert.doesNotMatch(html, /cdn\.tailwindcss\.com/, 'Production UI must not depend on Tailwind Play CDN');
  assert.match(html, /id="community-load-more"/, 'Community feed must expose its pagination control');
  assert.match(html, /\/api\/posts\?before=/, 'Community feed must request subsequent pages with a cursor');
  assert.match(html, /id="tab-friends"/, 'The friends screen must be present');
  assert.match(html, /livekit-client\.umd\.js/, 'The bundled LiveKit browser SDK must be loaded locally');
  assert.match(html, /function connectLiveKitSession\(/, 'The live UI must connect to authenticated LiveKit sessions');
  assert.match(html, /function startLiveStream\(/, 'Creators must be able to start a real stream from the UI');
  assert.match(html, /function joinLiveStream\(/, 'Viewers must be able to join live streams from the UI');
  assert.match(html, /function toggleLiveScreenShare\(/, 'Creators must have a screen-sharing control');
  assert.match(html, /RoomEvent\.ParticipantConnected/, 'Live viewers must update the connected participant count');
  assert.match(html, /live-player-participant-count/, 'The live player must expose participant synchronization status');
  assert.match(html, /function connectPresenceSocket\(\)/, 'Authenticated users must connect the app-wide presence socket');
  assert.match(html, /presenceSocket\.emit\('presence_heartbeat', \{\}/, 'The client must send expiring presence heartbeats');
  assert.match(html, /● En línea/, 'Friend rows must show online status');
  assert.match(html, /○ Desconectado/, 'Friend rows must show offline status');
  assert.match(html, /closeDirectConversation\(\);\s*closeRoomChat\(\);/, 'Logout must close authenticated chat sockets');
  assert.match(html, /id="dm-typing-status"/, 'Private conversations must expose an accessible typing status');
  assert.match(html, /directSocket\.on\('direct_typing'/, 'Private chats must receive typing indicators');
  assert.match(html, /directSocket\.emit\('direct_typing_start'/, 'Private chats must send typing start events');
  assert.match(html, /directSocket\.emit\('direct_typing_stop'/, 'Private chats must send typing stop events');
  assert.match(html, /directSocket\.on\('direct_messages_read'/, 'Private chats must receive read receipts');
  assert.match(html, /mark_direct_messages_read/, 'Opening and receiving messages must update read state');
  assert.match(html, /✓✓ Leído/, 'Own messages must show their read receipt state');

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
  assert.ok(html.includes("'/api/rooms/' + encodeURIComponent(activeRoomId) + '/messages'"), 'The chat interface must load and send messages through the room API');
  assert.match(html, /id="header-créditos"/, 'The active wallet balance must have a visible header target');
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
