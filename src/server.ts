import { serve } from '@hono/node-server';
import { Store } from './store.js';
import { createApp } from './app.js';

process.umask(0o077);
const store=new Store(process.env.TASK_HUB_DB??'data/task-hub.sqlite');
const port=Number(process.env.PORT??4180);
if(!Number.isInteger(port)||port<1||port>65535) throw new Error('Invalid PORT');
const server=serve({fetch:createApp(store).fetch,hostname:process.env.HOST??'127.0.0.1',port});
console.log(`Task Hub API listening on port ${port}`);
for(const signal of ['SIGINT','SIGTERM']) process.once(signal,()=>{
  server.close(()=>{store.close();process.exit(0);});
  setTimeout(()=>process.exit(1),5000).unref();
});
