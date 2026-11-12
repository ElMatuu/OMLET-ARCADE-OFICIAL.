const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('self-hosted MongoDB uses a replica set and waits for its primary before starting the API', () => {
  const compose = fs.readFileSync('docker-compose.yml', 'utf8');
  assert.match(compose, /--replSet", "rs0"/);
  assert.match(compose, /rs\.initiate\(\{_id: "rs0"/);
  assert.match(compose, /db\.hello\(\)\.isWritablePrimary/);
  assert.match(compose, /authSource=playverse&replicaSet=rs0/);
  assert.match(compose, /condition: service_healthy/);
});

test('self-hosted MongoDB keeps the application account scoped to the PLAYVERSE database', () => {
  const init = fs.readFileSync('docker/mongo-init/01-create-app-user.sh', 'utf8');
  assert.match(init, /getSiblingDB\('playverse'\)/);
  assert.match(init, /roles: \[\{role: 'readWrite', db: 'playverse'\}\]/);
  assert.doesNotMatch(init, /root|dbAdmin|userAdmin/i);
});
