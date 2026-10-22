import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { serve } from '@hono/node-server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Store } from '../src/store.js';
import { createApp } from '../src/app.js';

test('REST + real MCP: handoff, privacy, rollback, retry, restart and revoked tokens',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'task-hub-test-')),path=join(dir,'test.sqlite');
  let store=new Store(path), app=createApp(store);
  const tokenA=randomBytes(32).toString('hex'),tokenB=randomBytes(32).toString('hex'),tokenW=randomBytes(32).toString('hex');
  const a=store.provisionClient({label:'A',scope:'personal',read_private:true},tokenA);
  store.provisionClient({label:'B',scope:'personal',read_private:false},tokenB);
  store.provisionClient({label:'W',scope:'work',read_private:false},tokenW);
  async function req(method:string,url:string,body?:unknown,token=tokenA,expected=200) {
    const res=await app.request('/api/v1'+url,{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const result=await res.json(); assert.equal(res.status,expected,JSON.stringify(result)); return result;
  }
  const op=()=>({operation_id:randomUUID()});
  const server=serve({fetch:(...args)=>app.fetch(...args),hostname:'127.0.0.1',port:0});
  await once(server,'listening');
  const address=server.address(); assert(address&&typeof address!=='string');
  const tokenFile=join(dir,'b.token'); writeFileSync(tokenFile,tokenB,{mode:0o600});
  const transport=new StdioClientTransport({command:process.execPath,args:['--import','tsx','src/mcp.ts'],env:{PATH:process.env.PATH??'',TASK_HUB_URL:`http://127.0.0.1:${address.port}`,TASK_HUB_TOKEN_FILE:tokenFile},stderr:'pipe'});
  const client=new Client({name:'test-client',version:'1'});
  try {
    await req('GET','/tasks',undefined,'bad',401);
    await req('POST','/projects',{...op(),code:'WORK',name:'Work',scope:'work'},tokenA,403);
    const project=await req('POST','/projects',{...op(),code:'LAB',name:'Lab',scope:'personal'});
    const work=await req('POST','/projects',{...op(),code:'WORK',name:'Work',scope:'work'},tokenW);
    assert.equal(work.completion_rule,'production_release');
    const task=await req('POST','/tasks',{...op(),project_id:project.id,title:'Restore',checklist:['Backup','Restore']});
    const other=await req('POST','/tasks',{...op(),project_id:project.id,title:'Other',checklist:['Other item']});
    const url='/tasks/'+task.id;
    const sa=await req('POST','/sessions',{...op(),label:'A'});
    const sb=await req('POST','/sessions',{...op(),label:'B'},tokenB);
    await req('GET',url,undefined,tokenW,404);
    await req('POST',url+'/claim',{...op(),base_version:1,session_id:sa.id},tokenB,403);
    let current=await req('POST',url+'/claim',{...op(),base_version:1,session_id:sa.id});
    await req('PATCH',url,{...op(),base_version:current.version,generation:current.generation,session_id:sa.id,status:'done'},tokenA,400);
    const oversized=await app.request('/api/v1/tasks',{method:'POST',headers:{Authorization:'Bearer '+tokenA,'Content-Type':'application/json'},body:JSON.stringify({title:'x'.repeat(70000)})});
    assert.equal(oversized.status,413);
    await req('POST',url+'/claim',{...op(),base_version:current.version,session_id:sb.id},tokenB,409);
    const checkpoint={...op(),base_version:current.version,generation:current.generation,session_id:sa.id,done:'Backup verified',next:'Restore VM',checklist:[{id:task.checklist[0].id,done:true}],private_note:'Private fixture',end_session:false};
    await req('POST',url+'/checkpoints',{...checkpoint,checklist:[...checkpoint.checklist,{id:other.checklist[0].id,done:true}]},tokenA,400);
    assert.equal((await req('GET',url)).checklist[0].done,false);
    assert.equal((await req('GET',url+'/checkpoints')).items.length,0);
    const first=await req('POST',url+'/checkpoints',checkpoint);
    assert.equal(first.owner_session_id,sa.id);
    assert.deepEqual(await req('POST',url+'/checkpoints',checkpoint),first);
    await req('POST',url+'/checkpoints',{...checkpoint,next:'Different'},tokenA,409);
    await req('POST',url+'/checkpoints',{...checkpoint,...op()},tokenA,409);
    const finish={...checkpoint,...op(),base_version:first.version,end_session:true,done:'Restore verified',next:'Write guide'};
    const final=await req('POST',url+'/checkpoints',finish);
    assert.equal(final.owner_session_id,null); assert.equal(final.status,'in_progress');
    assert.deepEqual(await req('POST',url+'/checkpoints',finish),final);
    assert.equal((await req('GET',url+'/checkpoints')).items.length,2);
    const page=await req('GET',url+'/checkpoints?limit=1');
    assert.equal(page.items[0].id,final.checkpoint_id);
    assert.equal((await req('GET',url+'/checkpoints?limit=1&cursor='+page.next_cursor)).items[0].id,first.checkpoint_id);
    const shared=await req('GET',url+'/context',undefined,tokenB);
    assert.equal(shared.checkpoint.next,'Write guide'); assert.equal(shared.task.checklist[0].done,true);
    assert(!JSON.stringify(shared).includes('Private fixture'));
    await req('GET',url+'/context?include_private=true',undefined,tokenB,403);
    assert.equal((await req('GET',url+'/context?include_private=true')).checkpoint.private_note,'Private fixture');
    store.close(); store=new Store(path); app=createApp(store);
    assert.equal((await req('GET',url+'/context')).checkpoint.id,final.checkpoint_id);
    assert.deepEqual(await req('POST',url+'/checkpoints',finish),final);
    await client.connect(transport);
    const tools=await client.listTools(); assert.equal(tools.tools.length,13);
    assert(!tools.tools.some(t=>/close_owner|archive/.test(t.name)));
    const context=await client.callTool({name:'get_task_context',arguments:{task_id:task.id}});
    assert(!context.isError);
    assert(JSON.stringify(context).includes('Write guide')); assert(!JSON.stringify(context).includes('Private fixture'));
    const claim=await client.callTool({name:'claim_task',arguments:{...op(),task_id:task.id,base_version:final.version,session_id:sb.id}});
    assert(!claim.isError);
    current=await req('GET',url);
    const mcpSave=await client.callTool({name:'save_checkpoint',arguments:{...op(),task_id:task.id,base_version:current.version,generation:current.generation,session_id:sb.id,done:'B continued from A',next:'Review restore guide'}});
    assert(!mcpSave.isError);
    assert.equal((await req('GET',url+'/context')).checkpoint.done,'B continued from A');
    assert.equal((await req('GET',url+'/context?include_private=true')).checkpoint.private_note,'Private fixture');
    current=await req('GET',url);
    store.closeOwner({...op(),task_id:task.id,base_version:current.version,expected_owner_session_id:sb.id,expected_generation:current.generation});
    await req('POST',url+'/release',{...op(),session_id:sb.id,generation:current.generation,base_version:current.version},tokenB,409);
    assert.equal((await req('GET',url)).owner_session_id,null);
    store.run('UPDATE clients SET revoked_at=? WHERE id=?',new Date().toISOString(),a.id);
    await req('POST',url+'/checkpoints',finish,tokenA,401);
    assert.throws(()=>store.run('UPDATE checkpoints SET done=? WHERE id=?','bad',first.checkpoint_id),/immutable/);
  } finally {
    await client.close(); await transport.close();
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    store.close(); rmSync(dir,{recursive:true,force:true});
  }
});

test('two independent server processes share one SQLite claim safely',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'task-hub-race-')),path=join(dir,'race.sqlite');
  const store=new Store(path),token=randomBytes(32).toString('hex');
  store.provisionClient({label:'Race',scope:'all',read_private:false},token);
  const p=store.authenticate(token),op=()=>({operation_id:randomUUID()});
  const project=store.execute('create_project',{...op(),code:'RACE',name:'Race',scope:'personal'},p) as {id:string};
  const task=store.execute('create_task',{...op(),project_id:project.id,title:'Race'},p) as {id:string};
  const sessions=[0,1].map(i=>store.execute('open_session',{...op(),label:String(i)},p) as {id:string});
  const children=[0,1].map(()=>spawn(process.execPath,['--import','tsx','--input-type=module','-e',`import {serve} from '@hono/node-server'; import {Store} from './src/store.ts'; import {createApp} from './src/app.ts'; const db=new Store(process.env.TASK_HUB_DB); const s=serve({fetch:createApp(db).fetch,hostname:'127.0.0.1',port:0},a=>console.log(a.port)); process.on('SIGTERM',()=>s.close(()=>{db.close();process.exit(0)}));`],{env:{...process.env,TASK_HUB_DB:path},stdio:['ignore','pipe','pipe']}));
  try {
    const ports=await Promise.all(children.map(c=>new Promise<number>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Child startup timeout')),10000);
      c.stdout.once('data',d=>{clearTimeout(timer);resolve(Number(String(d).trim()));});
      c.once('error',reject); c.once('exit',code=>reject(new Error('Child exited '+code)));
    })));
    const responses=await Promise.all(ports.map((port,i)=>fetch(`http://127.0.0.1:${port}/api/v1/tasks/${task.id}/claim`,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({...op(),session_id:sessions[i].id,base_version:1})})));
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    assert.equal(store.one('SELECT version FROM tasks WHERE id=?',task.id)?.version,2);
    assert(sessions.some(s=>s.id===store.one('SELECT owner_session_id FROM tasks WHERE id=?',task.id)?.owner_session_id));
  } finally {
    await Promise.all(children.map(async c=>{if(c.exitCode===null){const exited=once(c,'exit');c.kill('SIGTERM');await exited;}}));
    store.close();rmSync(dir,{recursive:true,force:true});
  }
});
