const crypto = require('node:crypto');

function encodeRfc3986(value) {
  return encodeURIComponent(String(value)).replace(/[!'()*]/g, char =>
    '%' + char.charCodeAt(0).toString(16).toUpperCase()
  );
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest(encoding);
}

function createPresignedRecordingUrl({ storage, objectKey, expiresInSeconds = 300, now = new Date() }) {
  if (!storage || !storage.accessKey || !storage.secret || !storage.bucket) {
    throw new TypeError('Recording storage credentials are required.');
  }
  if (typeof objectKey !== 'string' || !/^playverse\/[a-fA-F0-9]{24}\/[a-fA-F0-9]{24}\/[0-9]+\.mp4$/.test(objectKey)) {
    throw new TypeError('Invalid private recording object key.');
  }
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 900) {
    throw new TypeError('Recording playback URL expiry must be between 60 and 900 seconds.');
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid signing time.');

  const region = storage.region || 'us-east-1';
  if (!/^[a-z0-9-]{1,64}$/.test(region)) throw new TypeError('Invalid S3 region.');
  const endpoint = storage.endpoint ? new URL(storage.endpoint) : new URL('https://s3.' + region + '.amazonaws.com');
  if (!['http:', 'https:'].includes(endpoint.protocol) || !endpoint.host || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) {
    throw new TypeError('Invalid S3 endpoint.');
  }

  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = dateStamp + 'T' + now.toISOString().slice(11, 19).replace(/:/g, '') + 'Z';
  const scope = dateStamp + '/' + region + '/s3/aws4_request';
  const basePath = endpoint.pathname.split('/').filter(Boolean).map(encodeRfc3986).join('/');
  const canonicalUri = '/' + [basePath, encodeRfc3986(storage.bucket), objectKey.split('/').map(encodeRfc3986).join('/')].filter(Boolean).join('/');
  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', storage.accessKey + '/' + scope],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresInSeconds)],
    ['X-Amz-SignedHeaders', 'host']
  ].map(([key, value]) => [encodeRfc3986(key), encodeRfc3986(value)])
    .sort((a, b) => a[0].localeCompare(b[0]));
  const canonicalQuery = query.map(([key, value]) => key + '=' + value).join('&');
  const canonicalRequest = [
    'GET',
    canonicalUri,
    canonicalQuery,
    'host:' + endpoint.host.toLowerCase() + '\n',
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')
  ].join('\n');
  const dateKey = hmac(Buffer.from('AWS4' + storage.secret, 'utf8'), dateStamp);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, 's3');
  const signingKey = hmac(serviceKey, 'aws4_request');
  const signature = hmac(signingKey, stringToSign, 'hex');
  return endpoint.protocol + '//' + endpoint.host.toLowerCase() + canonicalUri + '?' +
    canonicalQuery + '&X-Amz-Signature=' + signature;
}

module.exports = { createPresignedRecordingUrl, encodeRfc3986 };
