import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import SwaggerParser from '@apidevtools/swagger-parser';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { z } from 'zod';
import { schemas, routes, closeSchema } from '../src/contracts.js';

export const specPath=fileURLToPath(new URL('../openapi.yaml',import.meta.url));
export function requestContract(route:typeof routes[number]) {
  const schema=z.toJSONSchema(schemas[route.command],{io:'input'});
  delete schema.$schema;
  const pathNames=[...route.path.matchAll(/:(\w+)/g)].map(x=>x[1]);
  const parameters=Object.entries(schema.properties??{}).filter(([name])=>route.method==='GET'||pathNames.includes(name)).map(([name,value])=>({
    name,in:pathNames.includes(name)?'path':'query',required:pathNames.includes(name)||!!schema.required?.includes(name),schema:value,
  }));
  const body=structuredClone(schema);
  for(const name of pathNames) delete body.properties![name];
  body.required=body.required?.filter(name=>!pathNames.includes(name));
  return {parameters,body:route.method==='GET'?undefined:body};
}
function structural(value:unknown):unknown {
  if(Array.isArray(value)) return value.map(structural);
  if(value&&typeof value==='object') return Object.fromEntries(Object.entries(value).filter(([key])=>!['description','example','examples','title'].includes(key)).map(([key,v])=>[key,structural(v)]));
  return value;
}
export async function loadContract() {
  const raw=parse(readFileSync(specPath,'utf8'));
  await SwaggerParser.validate(structuredClone(raw));
  const spec=await SwaggerParser.dereference(structuredClone(raw));
  const ajv=new Ajv2020({strict:false,allErrors:true});
  addFormats(ajv);
  const expected=['GET /health','GET /api/v1/auth/login','GET /api/v1/auth/me','POST /api/v1/auth/logout','POST /api/v1/tasks/{task_id}/close-owner',...routes.map(r=>r.method+' /api/v1'+r.path.replace(/:(\w+)/g,'{$1}'))].sort();
  const actual=Object.entries(raw.paths).flatMap(([path,item])=>Object.keys(item as object).filter(method=>['get','post','patch','put','delete','options','head','trace'].includes(method)).map(method=>method.toUpperCase()+' '+path)).sort();
  assert.deepEqual(actual,expected,'OpenAPI operations must exactly match BE routes');
  assert.deepEqual(raw.security,[{bearerAuth:[]},{ssoCookie:[]}]);
  assert.deepEqual(raw.paths['/health'].get.security,[]);
  assert.deepEqual(raw.paths['/api/v1/auth/login'].get.security,[]);
  assert.deepEqual(raw.paths['/api/v1/auth/me'].get.security,[{ssoCookie:[]}]);
  for(const path of ['/api/v1/auth/logout','/api/v1/tasks/{task_id}/close-owner']) assert.deepEqual(raw.paths[path].post.security,[{ssoCookie:[],csrfHeader:[]}]);
  const closeBody=z.toJSONSchema(closeSchema.omit({task_id:true}),{io:'input'});
  delete closeBody.$schema;
  assert.deepEqual(structural(spec.paths!['/api/v1/tasks/{task_id}/close-owner']!.post.requestBody.content['application/json'].schema),structural(closeBody));
  const ids=new Set<string>();
  for(const route of routes) {
    const path='/api/v1'+route.path.replace(/:(\w+)/g,'{$1}');
    const operation=spec.paths![path]![route.method.toLowerCase()];
    if(route.method!=='GET') assert.deepEqual(operation.security,[{bearerAuth:[]},{ssoCookie:[],csrfHeader:[]}]);
    assert.equal(operation.operationId,route.command);
    assert(!ids.has(operation.operationId)); ids.add(operation.operationId);
    const contract=requestContract(route);
    assert.deepEqual(structural(operation.parameters??[]),structural(contract.parameters),`${route.command}: path/query schema drift`);
    if(contract.body) {
      assert.equal(operation.requestBody.required,true);
      assert.deepEqual(structural(operation.requestBody.content['application/json'].schema),structural(contract.body),`${route.command}: body schema drift`);
    } else assert.equal(operation.requestBody,undefined);
    assert(operation.responses['200'].content['application/json'].schema,`${route.command}: response required`);
  }
  const validators=new Map<string,ReturnType<typeof ajv.compile>>();
  for(const [path,item] of Object.entries(spec.paths!)) for(const [method,operation] of Object.entries(item!)) {
    if(!['get','post','patch'].includes(method)) continue;
    for(const [status,response] of Object.entries(operation.responses)) {
      if(status==='302') {
        assert.equal(path,'/api/v1/auth/login');
        assert.equal(response.headers.Location.schema.format,'uri');
        continue;
      }
      const media=response.content?.['application/json'];
      assert(media?.schema,`${method} ${path}: ${status} schema required`);
      const validate=ajv.compile(media.schema);
      validators.set(`${method.toUpperCase()} ${path} ${status}`,validate);
      if(media.example!==undefined) assert(validate(media.example),ajv.errorsText(validate.errors));
      for(const example of Object.values(media.examples??{})) assert(validate(example.value),ajv.errorsText(validate.errors));
    }
    const media=operation.requestBody?.content?.['application/json'];
    if(media?.example!==undefined) {const validate=ajv.compile(media.schema);assert(validate(media.example),ajv.errorsText(validate.errors));}
  }
  return {
    assertResponse(method:string,url:string,status:number,body:unknown) {
      const path=new URL(url,'http://localhost').pathname;
      const route=expected.find(key=>{
        const [verb,template]=key.split(' ');
        return verb===method&&new RegExp('^'+template.replace(/\{\w+\}/g,'[^/]+')+'$').test(path);
      });
      assert(route,`Undocumented route: ${method} ${path}`);
      const validate=validators.get(`${route} ${status}`);
      assert(validate,`Undocumented status: ${route} ${status}`);
      assert(validate(body),`${route} ${status}: ${ajv.errorsText(validate.errors)}`);
    },
  };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  await loadContract();
  console.log('OpenAPI valid: 18 operations, request schemas match BE, schemas and examples validated.');
}
