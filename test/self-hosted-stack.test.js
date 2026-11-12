const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
const livekitConfig = fs.readFileSync(path.join(__dirname, '..', 'livekit.yaml'), 'utf8');
const egressConfig = fs.readFileSync(path.join(__dirname, '..', 'egress.yaml'), 'utf8');
const replicaInit = fs.readFileSync(path.join(__dirname, '..', 'docker', 'mongo-init-replica-set.sh'), 'utf8');
const replicaService = compose.split('  mongo-init-replica-set:')[1].split('\n  api:')[0];

test('self-hosted MongoDB enables authenticated transactions through a replica set', () => {
  assert.match(compose, /--replSet", "rs0"/);
  assert.match(compose, /--keyFile", "\/run\/secrets\/mongo-keyfile"/);
  assert.match(compose, /playverse_mongo_keyfile:\/run\/secrets:ro/);
  assert.match(compose, /replicaSet=rs0&retryWrites=true&w=majority/);
  assert.match(compose, /mongo-init-replica-set:[\s\S]*service_completed_successfully/);
  assert.match(compose, /init-replica-set\.sh:ro/);
  assert.match(replicaService, /networks: \[playverse\]/);
  assert.match(replicaInit, /rs\.initiate/);
  assert.match(replicaInit, /mongo:27017/);
  assert.doesNotMatch(compose, /"27017:27017"/);
});

test('self-hosted Mongo keyfile is persistent and permission-restricted', () => {
  assert.match(compose, /playverse_mongo_keyfile:\/keydata/);
  assert.match(compose, /chown 999:999 \/keydata\/mongo-keyfile/);
  assert.match(compose, /chmod 0400 \/keydata\/mongo-keyfile/);
});


test('self-hosted LiveKit includes its shared Redis bus and a matching Egress worker', () => {
  assert.ok(compose.includes('  redis:\n    image: redis:7.4-alpine'));
  assert.ok(compose.includes('  livekit-egress:\n    image: livekit/egress:v1.9.0'));
  assert.ok(compose.includes('EGRESS_CONFIG_FILE: /etc/egress.yaml'));
  assert.ok(compose.includes('  playverse_redis_data:\n'));
  assert.ok(livekitConfig.includes('redis:\n  address: redis:6379'));
  assert.ok(egressConfig.includes('redis:\n  address: redis:6379'));
  assert.ok(egressConfig.includes('ws_url: ws://livekit:7880'));
  assert.ok(egressConfig.includes('insecure: true'));
});
