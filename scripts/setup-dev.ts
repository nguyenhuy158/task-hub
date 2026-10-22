import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, renameSync, rmSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { Store } from '../src/store.js';

const defaultConfig='TASK_HUB_DB=data/dev/task-hub.sqlite\nHOST=127.0.0.1\nPORT=4181\n';
export function setupDev(root:string) {
  const data=join(root,'data'),target=join(data,'dev'),config=join(root,'.env.development.local');
  if(existsSync(config)) {
    if(lstatSync(config).isSymbolicLink()) throw new Error('Refusing symlink dev config');
    const env=parseEnv(readFileSync(config,'utf8'));
    if(resolve(root,env.TASK_HUB_DB??'')!==join(target,'task-hub.sqlite')||env.HOST!=='127.0.0.1'||!/^\d+$/.test(env.PORT??'')||Number(env.PORT)<1||Number(env.PORT)>65535) throw new Error('Existing dev config must select data/dev/task-hub.sqlite, loopback HOST and a valid PORT; nothing overwritten');
  }
  if(existsSync(data)&&lstatSync(data).isSymbolicLink()) throw new Error('Refusing symlink data directory');
  mkdirSync(data,{recursive:true,mode:0o700});
  const lock=join(data,'.setup-lock');
  mkdirSync(lock,{mode:0o700});
  let staging:string|undefined;
  try {
    if(existsSync(target)) {
      if(lstatSync(target).isSymbolicLink()) throw new Error('Refusing symlink dev directory');
      for(const file of ['manifest.json','task-hub.sqlite','client-a.token','client-b.token']) {
        const path=join(target,file);
        if(!existsSync(path)||!lstatSync(path).isFile()||lstatSync(path).isSymbolicLink()) throw new Error('Existing dev directory is not a complete bootstrap; nothing overwritten');
      }
      const manifest=JSON.parse(readFileSync(join(target,'manifest.json'),'utf8'));
      if(manifest.format!==1) throw new Error('Unsupported bootstrap manifest; nothing overwritten');
      const store=new Store(join(target,'task-hub.sqlite'));
      try {
        const a=store.authenticate(readFileSync(join(target,'client-a.token'),'utf8').trim());
        const b=store.authenticate(readFileSync(join(target,'client-b.token'),'utf8').trim());
        if(a.id!==manifest.client_a||b.id!==manifest.client_b) throw new Error('Dev token/client mismatch; nothing overwritten');
        store.task(a,manifest.task_id);
      } finally {store.close();}
    } else {
      staging=mkdtempSync(join(data,'.setup-'));
      const store=new Store(join(staging,'task-hub.sqlite'));
      try {
        const tokenA=randomBytes(32).toString('base64url'),tokenB=randomBytes(32).toString('base64url');
        const a=store.provisionClient({label:'Dev client A',scope:'personal',read_private:true},tokenA);
        const b=store.provisionClient({label:'Dev client B',scope:'personal',read_private:false},tokenB);
        const principal=store.authenticate(tokenA),op=()=>({operation_id:randomUUID()});
        const project=store.execute('create_project',{...op(),code:'DEV',name:'Synthetic development',scope:'personal'},principal) as {id:string};
        const task=store.execute('create_task',{...op(),project_id:project.id,title:'Try task handoff',checklist:['Read context','Continue on another client']},principal) as {id:string;version:number};
        const session=store.execute('open_session',{...op(),label:'Bootstrap fixture'},principal) as {id:string};
        const claim=store.execute('claim_task',{...op(),task_id:task.id,session_id:session.id,base_version:task.version},principal) as {version:number;generation:number};
        store.execute('save_checkpoint',{...op(),task_id:task.id,session_id:session.id,base_version:claim.version,generation:claim.generation,done:'Created synthetic fixture',next:'Claim this task from a dev client',end_session:true},principal);
        writeFileSync(join(staging,'client-a.token'),tokenA+'\n',{mode:0o600,flag:'wx'});
        writeFileSync(join(staging,'client-b.token'),tokenB+'\n',{mode:0o600,flag:'wx'});
        writeFileSync(join(staging,'manifest.json'),JSON.stringify({format:1,client_a:a.id,client_b:b.id,project_id:project.id,task_id:task.id},null,2)+'\n',{mode:0o600,flag:'wx'});
      } finally { store.close(); }
      renameSync(staging,target);staging=undefined;
    }
    if(!existsSync(config)) writeFileSync(config,defaultConfig,{mode:0o600,flag:'wx'});
    return {directory:target,config,token_files:['client-a.token','client-b.token'],port:Number(parseEnv(readFileSync(config,'utf8')).PORT)};
  } finally {
    if(staging) rmSync(staging,{recursive:true,force:true});
    rmSync(lock,{recursive:true});
  }
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  process.umask(0o077);
  const result=setupDev(fileURLToPath(new URL('..',import.meta.url)));
  console.log(`Dev ready on loopback port ${result.port}. Run: pnpm dev`);
  console.log('Synthetic DB: data/dev/task-hub.sqlite. Token files: data/dev/client-a.token and client-b.token. Values are not printed.');
}
