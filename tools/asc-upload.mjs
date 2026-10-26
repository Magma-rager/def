// Uploads an .ipa to App Store Connect with Apple's Build Upload API (WWDC25 session 324),
// from any OS: Node 18+ only, no Xcode/altool/Transporter.
//
//   node tools/asc-upload.mjs --ipa App.ipa --app-id 1234567890 --version 1.0 --build 1 \
//        --key AuthKey_ABC123.p8 --key-id ABC123 --issuer 00000000-0000-0000-0000-000000000000
//   add --dry-run to print the requests without sending them.
//
// Flow (schemas from developer.apple.com/documentation/appstoreconnectapi):
//   POST  /v1/buildUploads            {cfBundleShortVersionString, cfBundleVersion, platform} + app
//   POST  /v1/buildUploadFiles        {assetType: ASSET, fileName, fileSize, uti: com.apple.ipa} + buildUpload
//   PUT   <uploadOperations[i].url>   bytes [offset, offset+length) with the given requestHeaders
//   PATCH /v1/buildUploadFiles/{id}   {uploaded: true, sourceFileChecksums}
//   GET   /v1/buildUploads/{id}       until state.state is COMPLETE or FAILED
import fs from 'node:fs';
import crypto from 'node:crypto';

const API = 'https://api.appstoreconnect.apple.com';

function args() {
  const a = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2);
    a[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  }
  return a;
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// App Store Connect API token: ES256 JWT, max lifetime 20 minutes.
export function makeToken({ keyPem, keyId, issuer, now = Math.floor(Date.now() / 1000) }) {
  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = { iss: issuer, iat: now, exp: now + 1140, aud: 'appstoreconnect-v1' };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = crypto.sign('sha256', Buffer.from(data), { key: keyPem, dsaEncoding: 'ieee-p1363' });
  return `${data}.${b64url(sig)}`;
}

export function buildUploadBody({ appId, version, build }) {
  return {
    data: {
      type: 'buildUploads',
      attributes: { cfBundleShortVersionString: String(version), cfBundleVersion: String(build), platform: 'IOS' },
      relationships: { app: { data: { type: 'apps', id: String(appId) } } },
    },
  };
}

export function buildUploadFileBody({ uploadId, fileName, fileSize }) {
  return {
    data: {
      type: 'buildUploadFiles',
      attributes: { assetType: 'ASSET', fileName, fileSize, uti: 'com.apple.ipa' },
      relationships: { buildUpload: { data: { type: 'buildUploads', id: uploadId } } },
    },
  };
}

export function commitBody({ fileId, sha256 }) {
  return {
    data: {
      type: 'buildUploadFiles',
      id: fileId,
      attributes: { uploaded: true, sourceFileChecksums: { file: { algorithm: 'SHA_256', hash: sha256 } } },
    },
  };
}

async function main() {
  const a = args();
  for (const k of ['ipa', 'app-id', 'version', 'build', 'key', 'key-id', 'issuer']) {
    if (!a[k]) throw new Error(`missing --${k}`);
  }
  const bytes = fs.readFileSync(a.ipa);
  const fileName = a.ipa.split(/[\\/]/).pop();
  const keyPem = fs.readFileSync(a.key, 'utf8');
  const token = () => makeToken({ keyPem, keyId: a['key-id'], issuer: a.issuer });
  const dry = !!a['dry-run'];

  const call = async (method, path, body) => {
    const url = path.startsWith('http') ? path : API + path;
    if (dry) {
      console.log(`${method} ${url}\n${body ? JSON.stringify(body, null, 2) : ''}`);
      return null;
    }
    const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n${text}`);
    return text ? JSON.parse(text) : null;
  };

  const upload = await call('POST', '/v1/buildUploads', buildUploadBody({ appId: a['app-id'], version: a.version, build: a.build }));
  const uploadId = upload ? upload.data.id : 'DRY_RUN_UPLOAD_ID';
  const file = await call('POST', '/v1/buildUploadFiles', buildUploadFileBody({ uploadId, fileName, fileSize: bytes.length }));
  const fileId = file ? file.data.id : 'DRY_RUN_FILE_ID';
  const ops = file ? file.data.attributes.uploadOperations || [] : [];
  for (const op of ops) {
    const chunk = bytes.subarray(op.offset, op.offset + op.length);
    const headers = Object.fromEntries((op.requestHeaders || []).map((h) => [h.name, h.value]));
    const res = await fetch(op.url, { method: op.method || 'PUT', headers, body: chunk });
    if (!res.ok) throw new Error(`chunk ${op.partNumber || op.offset} -> ${res.status} ${await res.text()}`);
    console.log(`uploaded part ${op.partNumber || '?'} (${chunk.length} bytes)`);
  }
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  await call('PATCH', `/v1/buildUploadFiles/${fileId}`, commitBody({ fileId, sha256 }));
  if (dry) return;
  for (let i = 0; i < 120; i++) {
    const s = await call('GET', `/v1/buildUploads/${uploadId}`);
    const st = s.data.attributes.state || {};
    console.log(`state: ${st.state}`);
    if (st.state === 'COMPLETE') return;
    if (st.state === 'FAILED') throw new Error(JSON.stringify(st.errors || st, null, 2));
    await new Promise((r) => setTimeout(r, 15000));
  }
  throw new Error('timed out waiting for processing');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}
