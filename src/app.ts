import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ZodError } from 'zod';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ApiError, Store, type Principal } from './store.js';
import { routes } from './contracts.js';
import type { WebAuth } from './auth.js';

export function createApp(store:Store,webAuth?:WebAuth) {
  const app=new Hono<{Variables:{principal:Principal;webUser:Awaited<ReturnType<WebAuth['authenticate']>>}}>();
  app.use('*',async(c,next)=>{
    c.header('Cache-Control','no-store');
    c.header('X-Content-Type-Options','nosniff');
    await next();
  });
  app.get('/health',c=>c.json({ok:true}));
  app.get('/api/v1/auth/login',c=>{
    if(!webAuth) throw new ApiError(503,'WEB_AUTH_DISABLED');
    webAuth.checkOrigin(c.req.raw.headers);
    return c.redirect(webAuth.redirect('login'),302);
  });
  app.use('/api/*',async(c,next)=>{
    const auth=c.req.header('Authorization');
    if(auth) {
      if(c.req.header('Origin')) throw new ApiError(403,'BROWSER_ORIGIN_NOT_ENABLED');
      if(!auth.startsWith('Bearer ')) throw new ApiError(401,'UNAUTHENTICATED');
      c.set('principal',store.authenticate(auth.slice(7)));
    } else {
      if(!webAuth) throw new ApiError(401,'UNAUTHENTICATED');
      webAuth.checkOrigin(c.req.raw.headers);
      const user=await webAuth.authenticate(c.req.raw.headers);
      if(!['GET','HEAD'].includes(c.req.method)) webAuth.checkCsrf(c.req.raw.headers,user.csrf_token);
      c.set('principal',store.webPrincipal(user.issuer,user.sub));
      c.set('webUser',user);
    }
    await next();
  });
  app.use('/api/*',bodyLimit({maxSize:65536,onError:c=>c.json({error:{code:'PAYLOAD_TOO_LARGE'}},413)}));
  app.get('/api/v1/auth/me',c=>{
    if(c.get('principal').kind!=='owner') throw new ApiError(403,'FORBIDDEN');
    const {sub,email,expires_at,csrf_token}=c.get('webUser');
    return c.json({sub,email,expires_at,csrf_token});
  });
  app.post('/api/v1/auth/logout',c=>{
    if(c.get('principal').kind!=='owner') throw new ApiError(403,'FORBIDDEN');
    return c.json({redirect_url:webAuth!.redirect('logout')});
  });
  app.post('/api/v1/tasks/:task_id/close-owner',async c=>{
    if(c.get('principal').kind!=='owner') throw new ApiError(403,'FORBIDDEN');
    if(!c.req.header('Content-Type')?.toLowerCase().startsWith('application/json')) throw new ApiError(415,'JSON_REQUIRED');
    let input;
    try { input=await c.req.json(); } catch { throw new ApiError(400,'INVALID_JSON'); }
    if(!input||typeof input!=='object'||Array.isArray(input)) throw new ApiError(400,'INVALID_INPUT');
    if(input.task_id!==undefined&&input.task_id!==c.req.param('task_id')) throw new ApiError(400,'PATH_BODY_MISMATCH');
    return c.json(store.closeOwner({...input,task_id:c.req.param('task_id')},c.get('principal')));
  });
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
