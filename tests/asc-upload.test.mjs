import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { makeToken, buildUploadBody, buildUploadFileBody, commitBody } from '../tools/asc-upload.mjs';

test('App Store Connect token is a valid ES256 JWT with the documented claims', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const tok = makeToken({ keyPem: pem, keyId: 'ABC123', issuer: 'issuer-uuid', now: 1000 });
  const [h, p, s] = tok.split('.');
  const dec = (x) => JSON.parse(Buffer.from(x, 'base64url').toString());
  assert.deepEqual(dec(h), { alg: 'ES256', kid: 'ABC123', typ: 'JWT' });
  assert.deepEqual(dec(p), { iss: 'issuer-uuid', iat: 1000, exp: 2140, aud: 'appstoreconnect-v1' });
  assert.ok(dec(p).exp - dec(p).iat <= 1200, 'token lifetime within 20 minutes');
  const ok = crypto.verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'));
  assert.ok(ok, 'signature verifies');
});

test('request bodies match the documented Build Upload API schemas', () => {
  const u = buildUploadBody({ appId: 123, version: '1.0', build: 7 });
  assert.equal(u.data.type, 'buildUploads');
  assert.deepEqual(u.data.attributes, { cfBundleShortVersionString: '1.0', cfBundleVersion: '7', platform: 'IOS' });
  assert.deepEqual(u.data.relationships.app.data, { type: 'apps', id: '123' });
  const f = buildUploadFileBody({ uploadId: 'U1', fileName: 'App.ipa', fileSize: 42 });
  assert.equal(f.data.type, 'buildUploadFiles');
  assert.deepEqual(f.data.attributes, { assetType: 'ASSET', fileName: 'App.ipa', fileSize: 42, uti: 'com.apple.ipa' });
  assert.deepEqual(f.data.relationships.buildUpload.data, { type: 'buildUploads', id: 'U1' });
  const c = commitBody({ fileId: 'F1', sha256: 'ab' });
  assert.deepEqual(c.data, { type: 'buildUploadFiles', id: 'F1', attributes: { uploaded: true, sourceFileChecksums: { file: { algorithm: 'SHA_256', hash: 'ab' } } } });
});
