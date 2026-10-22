import { readFileSync } from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { schemas, routes, reads } from './contracts.js';

const base=new URL(process.env.TASK_HUB_URL??'http://127.0.0.1:4180');
if(base.username||base.password||!['http:','https:'].includes(base.protocol)) throw new Error('Invalid TASK_HUB_URL');
if(base.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(base.hostname)) throw new Error('Remote API requires HTTPS');
const token=process.env.TASK_HUB_TOKEN_FILE?readFileSync(process.env.TASK_HUB_TOKEN_FILE,'utf8').trim():process.env.TASK_HUB_TOKEN;
if(!token) throw new Error('Set TASK_HUB_TOKEN_FILE');
const server=new McpServer({name:'task-hub',version:'0.1.0'});
for(const route of routes) {
  server.registerTool(route.command,{
    description:`Task Hub ${route.command}. Read latest version before mutations. Retry identical operation_id after uncertain results.`,
    inputSchema:schemas[route.command],
    annotations:{readOnlyHint:reads.has(route.command),destructiveHint:false,idempotentHint:true,openWorldHint:false},
  },async (args:Record<string,unknown>)=>{
    const body:Record<string,unknown>={...args};
    let path=route.path;
    for(const key of ['task_id','project_id']) if(path.includes(':'+key)) { path=path.replace(':'+key,encodeURIComponent(String(body[key]))); delete body[key]; }
    const url=new URL('/api/v1'+path,base);
    if(route.method==='GET') for(const [k,v] of Object.entries(body)) if(v!==undefined) url.searchParams.set(k,String(v));
    try {
      const response=await fetch(url,{method:route.method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:route.method==='GET'?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      return {content:[{type:'text' as const,text:JSON.stringify(result)}],isError:!response.ok};
    } catch { return {content:[{type:'text' as const,text:JSON.stringify({error:{code:'RESULT_UNKNOWN',message:'Keep draft. Retry identical request and operation_id.'}})}],isError:true}; }
  });
}
await server.connect(new StdioServerTransport());
