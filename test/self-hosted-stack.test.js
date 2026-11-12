const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const compose = fs.readFileSync(path.join(__dirname, '..', 'docker-compose.yml'), 'utf8');
const replicaInit = fs.readFileSync(path.join(__dirname, '..', 'docker', 'mongo-init-replica-set.sh'), 'utf8');

test('self-hosted MongoDB enables authenticated transactions through a replica set', () => {
  assert.match(compose, /--replSet", "rs0"/);
  assert.match(compose, /--keyFile", "\/run\/secrets\/mongo-keyfile"/);
  assert.match(compose, /playverse_mongo_keyfile:\/run\/secrets:ro/);
  assert.match(compose, /replicaSet=rs0&retryWrites=true&w=majority/);
  assert.match(compose, /mongo-init-replica-set:[\s\S]*service_completed_successfully/);
  assert.match(compose, /init-replica-set\.sh:ro/);
  assert.match(replicaInit, /rs\.initiate/);
  assert.match(replicaInit, /mongo:27017/);
  assert.doesNotMatch(compose, /"27017:27017"/);
});

test('self-hosted Mongo keyfile is persistent and permission-restricted', () => {
  assert.match(compose, /playverse_mongo_keyfile:\/keydata/);
  assert.match(compose, /chown 999:999 \/keydata\/mongo-keyfile/);
  assert.match(compose, /chmod 0400 \/keydata\/mongo-keyfile/);
});
