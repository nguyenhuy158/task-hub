import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ZodError } from 'zod';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ApiError, Store, type Principal } from './store.js';
import { routes } from './contracts.js';

export function createApp(store:Store) {
  const app=new Hono<{Variables:{principal:Principal}}>();
  app.use('*',async(c,next)=>{
    c.header('Cache-Control','no-store');
    c.header('X-Content-Type-Options','nosniff');
    await next();
  });
  app.get('/health',c=>c.json({ok:true}));
  app.use('/api/*',async(c,next)=>{
    if(c.req.header('Origin')) throw new ApiError(403,'BROWSER_ORIGIN_NOT_ENABLED');
    const auth=c.req.header('Authorization');
    if(!auth?.startsWith('Bearer ')) throw new ApiError(401,'UNAUTHENTICATED');
    c.set('principal',store.authenticate(auth.slice(7)));
    await next();
  });
  app.use('/api/*',bodyLimit({maxSize:65536,onError:c=>c.json({error:{code:'PAYLOAD_TOO_LARGE'}},413)}));
  for(const route of routes) app.on(route.method,'/api/v1'+route.path,async c=>{
    let input:Record<string,unknown>;
    if(route.method==='GET') {
      input={...c.req.query()};
      if(input.limit!==undefined) input.limit=Number(input.limit);
      if(input.include_private!==undefined) {
        if(input.include_private!=='true'&&input.include_private!=='false') throw new ApiError(400,'INVALID_INPUT');
        input.include_private=input.include_private==='true';
      }
    } else {
      if(!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415,'JSON_REQUIRED');
      try { input=await c.req.json(); } catch { throw new ApiError(400,'INVALID_JSON'); }
      if(!input||typeof input!=='object'||Array.isArray(input)) throw new ApiError(400,'INVALID_INPUT');
    }
    for(const [key,value] of Object.entries(c.req.param())) {
      if(input[key]!==undefined&&input[key]!==value) throw new ApiError(400,'PATH_BODY_MISMATCH');
      input[key]=value;
    }
    return c.json(store.execute(route.command,input,c.get('principal')) as object);
  });
  app.onError((error,c)=>{
    if(error instanceof ApiError) return c.json({error:{code:error.code}},error.status as ContentfulStatusCode);
    if(error instanceof ZodError) return c.json({error:{code:'INVALID_INPUT',fields:error.issues.map(x=>({path:x.path,code:x.code}))}},400);
    if(/database is locked|database is busy/.test(error.message)) { c.header('Retry-After','1'); return c.json({error:{code:'RETRY_LATER'}},503); }
    console.error('Task Hub request failed');
    return c.json({error:{code:'INTERNAL_ERROR'}},500);
  });
  app.notFound(c=>c.json({error:{code:'NOT_FOUND'}},404));
  return app;
}
