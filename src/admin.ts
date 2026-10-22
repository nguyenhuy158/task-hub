import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { z } from 'zod';
import { Store } from './store.js';

process.umask(0o077);
const [command,...args]=process.argv.slice(2);
const store=new Store(process.env.TASK_HUB_DB??'data/task-hub.sqlite');
try {
  if(command==='create-client') {
    const [label,scope,file,privateFlag]=args;
    const input=z.object({label:z.string().min(1),scope:z.enum(['all','personal','work']),read_private:z.boolean()}).parse({label,scope,read_private:privateFlag==='--private'});
    if(!file || (privateFlag&&privateFlag!=='--private')) throw new Error('create-client LABEL all|personal|work TOKEN_FILE [--private]');
    const token=randomBytes(32).toString('base64url');
    writeFileSync(file,token+'\n',{mode:0o600,flag:'wx'});
    try { console.log(JSON.stringify({...store.provisionClient(input,token),token_file:file})); }
    catch(error) { unlinkSync(file); throw error; }
  } else if(command==='list-clients') {
    console.log(JSON.stringify(store.all('SELECT id,label,scope,read_private,revoked_at FROM clients')));
  } else if(command==='revoke-client') {
    const id=z.uuid().parse(args[0]);
    console.log(JSON.stringify({revoked:store.run('UPDATE clients SET revoked_at=? WHERE id=?',new Date().toISOString(),id).changes===1}));
  } else if(command==='close-owner'||command==='archive') {
    if(args[1]!=='--confirm') throw new Error('Requires REQUEST_JSON_FILE --confirm');
    const input=JSON.parse(readFileSync(args[0],'utf8'));
    console.log(JSON.stringify(command==='close-owner'?store.closeOwner(input):store.archive(input)));
  } else if(command==='migrate') console.log('Schema ready');
  else throw new Error('Commands: migrate, create-client, list-clients, revoke-client, close-owner, archive');
} catch(error) {
  console.error(error instanceof z.ZodError?'Invalid admin arguments':error instanceof Error?error.message:'Admin command failed');
  process.exitCode=1;
} finally { store.close(); }
