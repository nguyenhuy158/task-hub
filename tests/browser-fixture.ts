import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { Store } from '../src/store.js';
import { createWebAuth, issuer, webOrigin } from '../src/auth.js';
import { createApp } from '../src/app.js';

process.umask(0o077);
const directory = mkdtempSync(join(tmpdir(), 'task-hub-web-'));
const store = new Store(join(directory, 'fixture.sqlite'));
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...await exportJWK(publicKey), kid: 'browser-fixture', alg: 'RS256' };
const verifier = createWebAuth('owner@example.com', createLocalJWKSet({ keys: [jwk] }));
const origin = 'http://127.0.0.1:4194';
function testHeaders(headers: Headers) {
  const copy = new Headers(headers);
  if (copy.get('Origin') === origin) copy.set('Origin', webOrigin);
  return copy;
}
const auth = { ...verifier,
  checkOrigin(headers: Headers, mutation = false) { verifier.checkOrigin(testHeaders(headers), mutation); },
  checkCsrf(headers: Headers, expected: string) { verifier.checkCsrf(testHeaders(headers), expected); },
};
const token = randomBytes(32).toString('hex');
store.provisionClient({ label: 'Synthetic AI', scope: 'all', read_private: false }, token);
const principal = store.authenticate(token);
const op = () => ({ operation_id: randomUUID() });
const project = store.execute('create_project', { ...op(), code: 'LAB', name: 'Không gian thử nghiệm', scope: 'personal' }, principal) as { id: string };
const task = store.execute('create_task', { ...op(), project_id: project.id, title: 'Kiểm tra luồng bàn giao', checklist: ['Đọc bàn giao gần nhất', 'Lưu kết quả cho phiên tiếp theo'] }, principal) as { id: string };
const other = store.execute('create_task', { ...op(), project_id: project.id, title: 'Đối chiếu bản backup', checklist: ['Kiểm tra bản khôi phục', 'Ghi bằng chứng'] }, principal) as { id: string };
const session = store.execute('open_session', { ...op(), label: 'AI kiểm thử' }, principal) as { id: string };
for (const id of [task.id, other.id]) {
  const claimed = store.execute('claim_task', { ...op(), task_id: id, session_id: session.id, base_version: 1 }, principal) as { version: number; generation: number };
  store.execute('save_checkpoint', { ...op(), task_id: id, session_id: session.id, base_version: claimed.version, generation: claimed.generation, done: 'Đã chuẩn bị dữ liệu giả để kiểm chứng giao diện.', next: id === task.id ? 'Nhận task và lưu bàn giao từ trình duyệt.' : 'Kiểm tra checklist sau khi thu hồi quyền làm.', end_session: id === task.id }, principal);
}
writeFileSync(join(directory, 'client.token'), token, { mode: 0o600 });
writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ task: task.id, other: other.id, session: session.id, project: project.id }));
const app = new Hono();
app.get('/__fixture/login', async c => {
  const jwt = await new SignJWT({ email: 'owner@example.com' }).setProtectedHeader({ alg: 'RS256', kid: 'browser-fixture' }).setIssuer(issuer).setAudience('huyab.click').setSubject('browser-fixture-owner').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  c.header('Set-Cookie', 'huyab_sso=' + jwt + '; HttpOnly; SameSite=Strict; Path=/');
  return c.redirect('/');
});
app.route('/', createApp(store, auth));
const server = serve({ hostname: '127.0.0.1', port: 4194, fetch: app.fetch }, () => console.log(JSON.stringify({ url: origin, directory, task: task.id, other: other.id })));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close(() => { store.close(); process.exit(0); }));
