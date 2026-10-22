import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { loadContract } from '../scripts/check-openapi.js';
import { Store } from '../src/store.js';
import { createApp } from '../src/app.js';

test('all HTTP operations return the OpenAPI wire contract',async()=>{
  const contract=await loadContract();
  const store=new Store(':memory:');
  const token=randomBytes(32).toString('hex');
  store.provisionClient({label:'Contract fixture',scope:'all',read_private:true},token);
  const app=createApp(store);
  const operation=()=>({operation_id:randomUUID()});
  async function call(method:string,path:string,body?:unknown,expected=200,credential=token) {
    const response=await app.request(path,{method,headers:{Authorization:'Bearer '+credential,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
    const data=await response.json();
    assert.equal(response.status,expected);
    contract.assertResponse(method,path,response.status,data);
    return data;
  }
  try {
    await call('GET','/health');
    await call('GET','/api/v1/projects',undefined,401,'invalid');
    let project=await call('POST','/api/v1/projects',{...operation(),code:'SPEC',name:'Contract',scope:'personal'});
    await call('GET','/api/v1/projects');
    project=await call('PATCH','/api/v1/projects/'+project.id,{...operation(),base_version:1,name:'Contract updated'});
    const session=await call('POST','/api/v1/sessions',{...operation(),label:'FE test'});
    let task=await call('POST','/api/v1/tasks',{...operation(),project_id:project.id,title:'Verify API',checklist:['Match response']});
    const path='/api/v1/tasks/'+task.id;
    const empty=await call('GET',path+'/context');
    assert.equal(empty.checkpoint,null);
    await call('GET','/api/v1/tasks?limit=1&scope=personal&query=SPEC-1');
    await call('GET',path);
    task=await call('POST',path+'/claim',{...operation(),base_version:1,session_id:session.id});
    const owned=()=>({...operation(),base_version:task.version,generation:task.generation,session_id:session.id});
    const complete={kind:'evidence',value:'Synthetic contract check'};
    task=await call('PATCH',path,{...owned(),status:'done',completion_evidence:complete,checklist:task.checklist.map((x:{id:string;text:string})=>({...x,done:true}))});
    assert.equal(typeof task.completion_evidence,'string');
    assert.deepEqual(JSON.parse(task.completion_evidence),complete);
    await call('POST',path+'/checkpoints',{...owned(),done:'Verified',next:'Review',evidence:[{kind:'url',value:'ftp://example.com'}]},400);
    const saved=await call('POST',path+'/checkpoints',{...owned(),done:'Verified',next:'Review',evidence:[{kind:'url',value:'https://example.com/result'}],private_note:'Private fixture'});
    task={...task,version:saved.version};
    await call('GET',path+'/context');
    await call('GET',path+'/context?include_private=true');
    await call('GET',path+'/checkpoints?include_private=true');
    task=await call('POST',path+'/release',owned());
    await call('POST',path+'/release',{...owned(),generation:task.generation-1},409);
    await call('GET','/api/v1/tasks/'+randomUUID(),undefined,404);
    await call('POST','/api/v1/tasks',{title:'x'.repeat(70000)},413);
    for(const [headers,expected] of [[{Authorization:'Bearer '+token,'Content-Type':'text/plain'},415],[{Authorization:'Bearer '+token,'Content-Type':'application/json',Origin:'http://localhost:5173'},403]] as const) {
      const response=await app.request('/api/v1/tasks',{method:'POST',headers,body:'{}'});
      assert.equal(response.status,expected);
      contract.assertResponse('POST','/api/v1/tasks',expected,await response.json());
    }
    const invalid=structuredClone(task);delete invalid.version;
    assert.throws(()=>contract.assertResponse('GET',path,200,invalid),/version/);
    assert.throws(()=>contract.assertResponse('GET',path,200,{...task,token_hash:'should never appear'}),/additional properties/);
  } finally { store.close(); }
});
