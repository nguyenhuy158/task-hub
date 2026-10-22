import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Store } from '../src/store.js';
import { createApp } from '../src/app.js';
import { checkpointRequest, draftIsCurrent, newDraft, rebaseDraft, readStored, draftSchema, pendingSchema } from '../web/state.js';
import { sendPending, ApiError, type Context } from '../web/api.js';

test('draft survives reload and a conflict requires explicit rebasing', () => {
  const taskId = randomUUID(), session = randomUUID(), item = randomUUID();
  const context = { task: { id: taskId, version: 2, generation: 2, owner_session_id: session, checklist: [{ id: item, text: 'Fixture', done: false }] }, checkpoint: null } as Context;
  const original = { ...newDraft(context, session), done: 'My unsaved work', next: 'Review', checklist: [{ id: item, done: true, text: 'Fixture' }] };
  const storage = { getItem: () => JSON.stringify(original) };
  const restored = readStored(storage, 'draft', draftSchema)!;
  assert.deepEqual(restored, original);
  assert(draftIsCurrent(restored, context, session));
  const changed = structuredClone(context);
  changed.task.version++;
  changed.task.checklist.push({ id: randomUUID(), text: 'New server item', done: false });
  assert(!draftIsCurrent(restored, changed, session));
  assert.equal(restored.base_version, 2);
  assert.equal(restored.done, 'My unsaved work');
  const rebased = rebaseDraft(restored, changed, session);
  assert(draftIsCurrent(rebased, changed, session));
  assert.equal(rebased.done, original.done);
  assert.deepEqual(rebased.checklist.map(x => x.done), [true, false]);
  assert(!draftIsCurrent(rebased, changed, randomUUID()));
  const checkpoint = checkpointRequest(rebased, randomUUID(), true);
  assert.equal(checkpoint.command, 'save_checkpoint');
  assert(!JSON.stringify(checkpoint).includes('New server item'));
  assert.equal(checkpoint.input.base_version, changed.task.version);
  assert.throws(() => readStored({ getItem: () => '{broken' }, 'draft', draftSchema));
});

test('lost response retries the same persisted operation without duplicate task', async () => {
  const store = new Store(':memory:');
  const token = randomBytes(32).toString('hex');
  store.provisionClient({ label: 'Fixture', scope: 'all', read_private: false }, token);
  const principal = store.authenticate(token);
  const project = store.execute('create_project', { operation_id: randomUUID(), code: 'WEB', name: 'Web', scope: 'personal' }, principal) as { id: string };
  const pending = pendingSchema.parse({ command: 'create_task', input: { operation_id: randomUUID(), project_id: project.id, title: 'Sent once', checklist: [] } });
  const persisted = JSON.stringify(pending);
  const app = createApp(store);
  const fetchOriginal = globalThis.fetch;
  const bodies: string[] = [];
  let loseResponse = true;
  globalThis.fetch = async (url, init) => {
    bodies.push(String(init?.body));
    const response = await app.request(String(url), { ...init, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' } });
    if (loseResponse) { loseResponse = false; throw new TypeError('Lost response'); }
    return response;
  };
  try {
    await assert.rejects(sendPending(pending, 'fixture'), error => error instanceof ApiError && error.status === 0);
    assert.equal(store.one('SELECT count(*) AS n FROM tasks')?.n, 1);
    const restored = readStored({ getItem: () => persisted }, 'pending', pendingSchema)!;
    const result = await sendPending(restored, 'fixture');
    assert.equal(result.title, 'Sent once');
    assert.equal(store.one('SELECT count(*) AS n FROM tasks')?.n, 1);
    assert.equal(bodies[0], bodies[1]);
    assert(!bodies[0].includes('csrf'));
    for (const path of ['/src/server.ts', '/.env.sso.local', '/data/dev/client-a.token', '/assets/../../.env.sso.local']) {
      assert.equal((await app.request(path)).status, 404);
    }
  } finally { globalThis.fetch = fetchOriginal; store.close(); }
});
