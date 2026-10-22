import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createLocalJWKSet, createRemoteJWKSet, customFetch, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createWebAuth, issuer, webOrigin, webAuthFromEnv } from '../src/auth.js';
import { createApp } from '../src/app.js';
import { Store } from '../src/store.js';
import { loadContract } from '../scripts/check-openapi.js';

test('SSO cookie, owner pinning, CSRF, AI separation and close-owner contract', async () => {
  const contract = await loadContract();
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'fixture', alg: 'RS256' };
  const auth = createWebAuth('owner@example.com', createLocalJWKSet({ keys: [jwk] }));
  const store = new Store(':memory:');
  const app = createApp(store, auth);
  const aiToken = randomBytes(32).toString('hex');
  store.provisionClient({ label: 'AI', scope: 'personal', read_private: false }, aiToken);
  const ai = store.authenticate(aiToken);
  const op = () => ({ operation_id: randomUUID() });
  const now = Math.floor(Date.now() / 1000);
  async function sign(overrides: Record<string, unknown> = {}, key = privateKey, alg = 'RS256') {
    return new SignJWT({ iss: issuer, aud: 'huyab.click', sub: 'fixture-owner', email: 'owner@example.com', iat: now, exp: now + 300, ...overrides }).setProtectedHeader({ alg, kid: 'fixture' }).sign(key);
  }
  const token = await sign();
  const cookie = { Cookie: 'huyab_sso=' + token };
  async function call(method: string, path: string, headers: Record<string, string> = cookie, body?: unknown, expected = 200) {
    const response = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, expected, path + ': ' + response.status);
    if (expected === 302) return response;
    const data = await response.json();
    contract.assertResponse(method, path, response.status, data);
    return data;
  }
  try {
    const disabled = await createApp(store).request('/api/v1/auth/login');
    assert.equal(disabled.status, 503);
    contract.assertResponse('GET', '/api/v1/auth/login', 503, await disabled.json());
    const login = await call('GET', '/api/v1/auth/login?redirect_uri=https://evil.example', {}, undefined, 302);
    const redirect = new URL(login.headers.get('Location'));
    assert.equal(redirect.origin, issuer);
    assert.equal(redirect.searchParams.get('redirect_uri'), webOrigin + '/');
    await call('GET', '/api/v1/auth/me', {}, undefined, 401);
    for (const claims of [{ email: 'stranger@example.com' }, { email: null }, { sub: '' }, { exp: now - 1 }, { exp: 'later' }, { exp: undefined }, { iss: 'https://evil.example' }, { aud: 'wrong' }, { nbf: now + 600 }, { iat: undefined }]) {
      await call('GET', '/api/v1/auth/me', { Cookie: 'huyab_sso=' + await sign(claims) }, undefined, claims.email === 'stranger@example.com' ? 403 : 401);
    }
    assert.equal(store.one('SELECT count(*) AS n FROM web_owner')?.n, 0);
    const wrongKey = await generateKeyPair('RS256');
    await call('GET', '/api/v1/auth/me', { Cookie: 'huyab_sso=' + await sign({}, wrongKey.privateKey) }, undefined, 401);
    const otherAlgorithm = await generateKeyPair('RS512');
    await call('GET', '/api/v1/auth/me', { Cookie: 'huyab_sso=' + await sign({}, otherAlgorithm.privateKey, 'RS512') }, undefined, 401);
    await call('GET', '/api/v1/auth/me', { Cookie: cookie.Cookie + '; ' + cookie.Cookie }, undefined, 401);
    const user = await call('GET', '/api/v1/auth/me');
    const response = await app.request('/api/v1/auth/me', { headers: cookie });
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), null);
    assert.equal(user.sub, 'fixture-owner');
    assert.equal(user.email, 'owner@example.com');
    assert.equal(user.expires_at, now + 300);
    assert(!JSON.stringify(user).includes(token));
    assert.equal(store.one('SELECT subject FROM web_owner')?.subject, 'fixture-owner');
    await call('GET', '/api/v1/auth/me', { Cookie: 'huyab_sso=' + await sign({ sub: 'other-sub' }) }, undefined, 403);
    await call('GET', '/api/v1/auth/me', { ...cookie, Origin: 'https://sibling.huyab.click' }, undefined, 403);
    await call('GET', '/api/v1/auth/me', { ...cookie, 'Sec-Fetch-Site': 'cross-site' }, undefined, 403);
    await call('GET', '/api/v1/auth/me', { Authorization: 'Bearer ' + token }, undefined, 401);
    await call('GET', '/api/v1/auth/me', { ...cookie, Authorization: 'Bearer invalid' }, undefined, 401);
    await call('GET', '/api/v1/auth/me', { Authorization: 'Bearer ' + aiToken }, undefined, 403);
    const mutation = { ...cookie, Origin: webOrigin, 'X-CSRF-Token': user.csrf_token, 'Content-Type': 'application/json' };
    for (const headers of [cookie, { ...cookie, Origin: webOrigin }, { ...mutation, Origin: 'null' }, { ...mutation, Origin: 'https://sibling.huyab.click' }, { ...mutation, 'X-CSRF-Token': 'wrong' }, { ...mutation, Cookie: 'huyab_sso=' + await sign({ iat: now - 1 }) }]) {
      await call('POST', '/api/v1/projects', headers, { ...op(), code: 'DENIED', name: 'Denied', scope: 'personal' }, 403);
    }
    assert.equal(store.one('SELECT count(*) AS n FROM projects')?.n, 0);
    const project = await call('POST', '/api/v1/projects', mutation, { ...op(), code: 'WEB', name: 'Synthetic', scope: 'work' });
    const task = await call('POST', '/api/v1/tasks', mutation, { ...op(), project_id: project.id, title: 'Synthetic task' });
    await call('GET', '/api/v1/tasks/' + task.id, { Authorization: 'Bearer ' + aiToken }, undefined, 404);
    const session = await call('POST', '/api/v1/sessions', mutation, { ...op(), label: 'Browser fixture' });
    const foreignSession = store.execute('open_session', { ...op(), label: 'AI session' }, ai) as { id: string };
    await call('POST', '/api/v1/tasks/' + task.id + '/claim', mutation, { ...op(), base_version: 1, session_id: foreignSession.id }, 403);
    const owned = await call('POST', '/api/v1/tasks/' + task.id + '/claim', mutation, { ...op(), base_version: 1, session_id: session.id });
    const path = '/api/v1/tasks/' + task.id + '/close-owner';
    const close = { ...op(), base_version: owned.version, expected_owner_session_id: session.id, expected_generation: owned.generation };
    await call('POST', path, { Authorization: 'Bearer ' + aiToken, 'Content-Type': 'application/json' }, close, 403);
    assert.throws(() => store.closeOwner({ ...close, task_id: task.id }, ai), /FORBIDDEN/);
    await call('POST', path, mutation, { ...close, base_version: 1 }, 409);
    await call('POST', path, mutation, { ...close, expected_owner_session_id: randomUUID() }, 409);
    await call('POST', path, mutation, { ...close, expected_generation: owned.generation + 1 }, 409);
    await call('POST', path, mutation, { ...close, task_id: randomUUID() }, 400);
    await call('POST', '/api/v1/tasks/' + randomUUID() + '/close-owner', mutation, close, 404);
    assert.equal(store.one('SELECT owner_session_id FROM tasks WHERE id=?', task.id)?.owner_session_id, session.id);
    const closed = await call('POST', path, mutation, close);
    assert.equal(closed.version, owned.version + 1);
    assert.deepEqual(await call('POST', path, mutation, close), closed);
    const saved = store.one('SELECT owner_session_id,generation,version FROM tasks WHERE id=?', task.id)!;
    assert.equal(saved.owner_session_id, null);
    assert.equal(saved.generation, owned.generation + 1);
    assert.equal(saved.version, closed.version);
    const logout = await call('POST', '/api/v1/auth/logout', mutation);
    assert.equal(logout.redirect_url, auth.redirect('logout'));
    assert.equal(new URL(logout.redirect_url).pathname, '/logout');
    await call('POST', '/api/v1/auth/logout', { Authorization: 'Bearer ' + aiToken }, undefined, 403);
    const revoked = store.one('SELECT client_id FROM web_owner')!.client_id!;
    store.run('UPDATE clients SET revoked_at=? WHERE id=?', new Date().toISOString(), revoked);
    await call('GET', '/api/v1/auth/me', cookie, undefined, 401);
  } finally { store.close(); }
});

test('JWKS cache refresh and failures remain closed', async () => {
  const pair = await generateKeyPair('RS256');
  let keys = [{ ...await exportJWK(pair.publicKey), kid: 'one', alg: 'RS256' }];
  let available = true, requests = 0;
  const remote = createRemoteJWKSet(new URL(issuer + '/.well-known/jwks.json'), {
    cooldownDuration: 0,
    [customFetch]: async () => { requests++; return available ? Response.json({ keys }) : new Response('', { status: 503 }); },
  });
  const auth = createWebAuth('owner@example.com', remote);
  async function headers(kid: string, key = pair.privateKey) {
    const token = await new SignJWT({ email: 'owner@example.com' }).setProtectedHeader({ alg: 'RS256', kid }).setIssuer(issuer).setAudience('huyab.click').setSubject('owner').setIssuedAt().setExpirationTime('5m').sign(key);
    return new Headers({ Cookie: 'huyab_sso=' + token });
  }
  await auth.authenticate(await headers('one'));
  await auth.authenticate(await headers('one'));
  assert.equal(requests, 1);
  const rotated = await generateKeyPair('RS256');
  keys = [{ ...await exportJWK(rotated.publicKey), kid: 'two', alg: 'RS256' }];
  await auth.authenticate(await headers('two', rotated.privateKey));
  assert.equal(requests, 2);
  available = false;
  await assert.rejects(auth.authenticate(await headers('unknown')), /UNAUTHENTICATED/);
  available = true;
  await auth.authenticate(await headers('two', rotated.privateKey));
});

test('migration preserves existing records and SSO identity survives restart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'task-hub-auth-'));
  const path = join(dir, 'test.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(readFileSync(new URL('../migrations/001.sql', import.meta.url), 'utf8'));
    old.exec("INSERT INTO clients VALUES('fixture','Original','fixture-hash','personal',0,NULL); PRAGMA user_version=1;");
    old.close();
    let store = new Store(path);
    assert.equal(store.one('PRAGMA user_version')?.user_version, 2);
    assert.equal(store.one("SELECT label FROM clients WHERE id='fixture'")?.label, 'Original');
    const owner = store.webPrincipal(issuer, 'owner');
    store.close();
    store = new Store(path);
    assert.deepEqual(store.webPrincipal(issuer, 'owner'), owner);
    assert.throws(() => store.webPrincipal(issuer, 'another'), /FORBIDDEN/);
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.equal(webAuthFromEnv({}), undefined);
  assert.throws(() => webAuthFromEnv({ TASK_HUB_SSO_ALLOWED_EMAIL: '' }));
});
