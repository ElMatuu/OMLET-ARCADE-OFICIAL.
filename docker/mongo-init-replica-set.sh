#!/usr/bin/env bash
set -euo pipefail

: "${MONGO_ROOT_USERNAME:?MONGO_ROOT_USERNAME is required}"
: "${MONGO_ROOT_PASSWORD:?MONGO_ROOT_PASSWORD is required}"

mongosh --quiet --host mongo:27017 \
  --username "$MONGO_ROOT_USERNAME" \
  --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval 'const hello = db.hello(); if (!hello.setName) { rs.initiate({_id: "rs0", members: [{_id: 0, host: "mongo:27017"}]}); }'

for attempt in $(seq 1 30); do
  if mongosh --quiet --host mongo:27017 \
    --username "$MONGO_ROOT_USERNAME" \
    --password "$MONGO_ROOT_PASSWORD" \
    --authenticationDatabase admin \
    --eval 'db.hello().isWritablePrimary' | grep -q true; then
    exit 0
  fi
  sleep 2
done

echo "MongoDB replica set did not become primary." >&2
exit 1
