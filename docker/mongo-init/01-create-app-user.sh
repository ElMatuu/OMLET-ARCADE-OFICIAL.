#!/bin/bash
set -euo pipefail

: "${MONGO_APP_USERNAME:?MONGO_APP_USERNAME is required}"
: "${MONGO_APP_PASSWORD:?MONGO_APP_PASSWORD is required}"

if [[ ! "$MONGO_APP_USERNAME" =~ ^[A-Za-z0-9_]{3,32}$ || ! "$MONGO_APP_PASSWORD" =~ ^[A-Za-z0-9_-]{24,128}$ ]]; then
  echo "Mongo app credentials must use the documented safe character set and length." >&2
  exit 1
fi

mongosh --quiet \
  --username "$MONGO_INITDB_ROOT_USERNAME" \
  --password "$MONGO_INITDB_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval "db.getSiblingDB('playverse').createUser({user: '$MONGO_APP_USERNAME', pwd: '$MONGO_APP_PASSWORD', roles: [{role: 'readWrite', db: 'playverse'}]})"
