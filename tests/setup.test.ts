import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, statSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupDev } from '../scripts/setup-dev.js';
import { Store } from '../src/store.js';

test('bootstrap creates usable fixtures and reruns without replacing data or tokens',()=>{
  const root=mkdtempSync(join(tmpdir(),'task-hub-setup-'));
  try {
    const first=setupDev(root),tokenPath=join(first.directory,'client-a.token');
    const token=readFileSync(tokenPath,'utf8');
    assert.equal(statSync(tokenPath).mode&0o777,0o600);
    const manifest=JSON.parse(readFileSync(join(first.directory,'manifest.json'),'utf8'));
    let store=new Store(join(first.directory,'task-hub.sqlite'));
    const principal=store.authenticate(token.trim());
    const context=store.execute('get_task_context',{task_id:manifest.task_id},principal) as {checkpoint:{next:string};task:{owner_session_id:null}};
    assert.equal(context.checkpoint.next,'Claim this task from a dev client');
    assert.equal(context.task.owner_session_id,null);
    const before=store.one('SELECT count(*) AS n FROM tasks')?.n;
    store.run('UPDATE tasks SET title=? WHERE id=?','Owner edit must survive',manifest.task_id);store.close();
    const config=readFileSync(first.config,'utf8').replace('4181','4281');writeFileSync(first.config,config);
    const second=setupDev(root);
    assert.equal(second.port,4281);assert.equal(readFileSync(first.config,'utf8'),config);
    assert.equal(readFileSync(tokenPath,'utf8'),token);
    store=new Store(join(second.directory,'task-hub.sqlite'));
    assert.equal(store.one('SELECT count(*) AS n FROM tasks')?.n,before);
    assert.equal(store.one('SELECT title FROM tasks WHERE id=?',manifest.task_id)?.title,'Owner edit must survive');
    assert.equal(store.one('SELECT count(*) AS n FROM clients')?.n,2);
    store.close();
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('bootstrap refuses foreign data, other DB configuration and concurrent setup',()=>{
  const root=mkdtempSync(join(tmpdir(),'task-hub-setup-guard-'));
  try {
    mkdirSync(join(root,'data','dev'),{recursive:true});
    const sentinel=join(root,'data','dev','task-hub.sqlite');writeFileSync(sentinel,'existing data');
    assert.throws(()=>setupDev(root),/complete bootstrap/);
    assert.equal(readFileSync(sentinel,'utf8'),'existing data');
    assert(!existsSync(join(root,'data','.setup-lock')));
    writeFileSync(join(root,'.env.development.local'),'TASK_HUB_DB=production.sqlite\nHOST=127.0.0.1\nPORT=4181\n');
    assert.throws(()=>setupDev(root),/nothing overwritten/);
    assert(!existsSync(join(root,'production.sqlite')));
    writeFileSync(join(root,'.env.development.local'),'TASK_HUB_DB=data/dev/task-hub.sqlite\nHOST=127.0.0.1\nPORT=4181\n');
    mkdirSync(join(root,'data','.setup-lock'));
    assert.throws(()=>setupDev(root),/EEXIST/);
    assert(existsSync(join(root,'data','.setup-lock')));
  } finally {rmSync(root,{recursive:true,force:true});}
});
