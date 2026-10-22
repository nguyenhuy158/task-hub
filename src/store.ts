import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { schemas, reads, closeSchema, archiveSchema, type Command } from './contracts.js';
import { z } from 'zod';

type Row = Record<string, string | number | null>;
export type Principal = { id: string; scope: string; read_private: number };
type Task = Row & { id:string; project_id:string; version:number; generation:number; owner_session_id:string|null; status:string; scope:string; completion_rule:string };
export class ApiError extends Error {
  constructor(public status:number, public code:string) { super(code); }
}
const fail = (status:number, code:string):never => { throw new ApiError(status, code); };
const hash = (s:string) => createHash('sha256').update(s).digest('hex');
const now = () => new Date().toISOString();
function canonical(value:unknown):string {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']';
  if (value && typeof value==='object') return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
export class Store {
  db:DatabaseSync;
  constructor(path:string) {
    if(path!==':memory:') mkdirSync(dirname(path),{recursive:true,mode:0o700});
    this.db=new DatabaseSync(path);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=2000;');
    this.transaction(()=>{
      const version=Number(this.one('PRAGMA user_version')?.user_version);
      if(version>1) throw new Error('Database schema newer than server');
      if(version===0) { this.db.exec(readFileSync(new URL('../migrations/001.sql',import.meta.url),'utf8')); this.db.exec('PRAGMA user_version=1'); }
    });
  }
  one(sql:string,...args:SQLInputValue[]):Row|undefined { return this.db.prepare(sql).get(...args) as Row|undefined; }
  all(sql:string,...args:SQLInputValue[]):Row[] { return this.db.prepare(sql).all(...args) as Row[]; }
  run(sql:string,...args:SQLInputValue[]) { return this.db.prepare(sql).run(...args); }
  transaction<T>(fn:()=>T,write=true):T {
    this.db.exec(write?'BEGIN IMMEDIATE':'BEGIN');
    try { const value=fn(); this.db.exec('COMMIT'); return value; }
    catch(error) { this.db.exec('ROLLBACK'); throw error; }
  }
  provisionClient(input:{label:string;scope:'all'|'personal'|'work';read_private:boolean},token:string) {
    z.object({label:z.string().min(1).max(120),scope:z.enum(['all','personal','work']),read_private:z.boolean()}).strict().parse(input);
    if(token.length<32) throw new Error('Token must contain at least 32 characters');
    const id=randomUUID();
    this.run('INSERT INTO clients(id,label,token_hash,scope,read_private) VALUES(?,?,?,?,?)',id,input.label,hash(token),input.scope,Number(input.read_private));
    return {id,label:input.label};
  }
  authenticate(token:string):Principal {
    const p=this.one('SELECT id,scope,read_private FROM clients WHERE token_hash=? AND revoked_at IS NULL',hash(token));
    if(!p) return fail(401,'UNAUTHENTICATED');
    return p as Principal;
  }
  active(p:Principal) { if(!this.one('SELECT id FROM clients WHERE id=? AND revoked_at IS NULL',p.id)) fail(401,'UNAUTHENTICATED'); }
  project(p:Principal,id:string) {
    const row=this.one('SELECT * FROM projects WHERE id=?',id);
    if(!row || (p.scope!=='all'&&p.scope!==row.scope)) return fail(404,'NOT_FOUND');
    return row;
  }
  task(p:Principal,id:string):Task {
    const t=this.one('SELECT tasks.*,projects.scope,projects.completion_rule FROM tasks JOIN projects ON projects.id=tasks.project_id WHERE tasks.id=?',id);
    if(!t || (p.scope!=='all'&&p.scope!==t.scope)) return fail(404,'NOT_FOUND');
    return t as Task;
  }
  items(id:string) { return this.all('SELECT id,text,done FROM checklist_items WHERE task_id=? ORDER BY position',id).map(x=>({id:String(x.id),text:String(x.text),done:!!x.done})); }
  view(t:Task) { return {...t,checklist:this.items(t.id)}; }
  session(p:Principal,id:string) { if(!this.one('SELECT id FROM sessions WHERE id=? AND client_id=?',id,p.id)) fail(403,'FORBIDDEN'); }
  version(t:Row,v:number) { if(t.version!==v) fail(409,'VERSION_CONFLICT'); }
  writable(t:Task) { if(t.archived_at) fail(409,'TASK_ARCHIVED'); }
  owner(p:Principal,t:Task,a:{session_id:string;generation:number;base_version:number}) {
    this.session(p,a.session_id); this.writable(t);
    if(t.owner_session_id!==a.session_id||t.generation!==a.generation) fail(409,'OWNER_CHANGED');
    this.version(t,a.base_version);
  }
  checkpointView(row:Row,includePrivate:boolean) {
    const {evidence_json,checklist_json,...data}=row;
    return {...data,evidence:JSON.parse(String(evidence_json)),checklist:JSON.parse(String(checklist_json)),...(includePrivate?{private_note:this.one('SELECT body FROM private_notes WHERE checkpoint_id=?',String(row.id))?.body??''}:{})};
  }
  mutate<T>(principal:string,operation:string,command:string,args:unknown,fn:()=>T):T {
    return this.transaction(()=>{
      const digest=hash(command+canonical(args));
      const previous=this.one('SELECT request_hash,response_json FROM operations WHERE principal_id=? AND operation_id=?',principal,operation);
      if(previous) { if(previous.request_hash!==digest) fail(409,'OPERATION_REUSED'); return JSON.parse(String(previous.response_json)); }
      const result=fn();
      this.run('INSERT INTO operations VALUES(?,?,?,?,?)',principal,operation,digest,JSON.stringify(result),now());
      return result;
    });
  }
  execute(command:Command,input:unknown,p:Principal):unknown {
    const a=schemas[command].parse(input);
    this.active(p);
    if(reads.has(command)) return this.transaction(()=>this.read(command,a,p),false);
    return this.mutate(p.id,(a as {operation_id:string}).operation_id,command,a,()=>{this.active(p);return this.write(command,a,p);});
  }
  read(command:Command,input:unknown,p:Principal):unknown {
    if(command==='list_projects') {
      const a=schemas.list_projects.parse(input);
      const rows=this.all("SELECT * FROM projects WHERE archived_at IS NULL AND (?='all' OR scope=?) AND id>? ORDER BY id LIMIT ?",p.scope,p.scope,a.cursor??'',a.limit+1);
      return this.page(rows,a.limit);
    }
    if(command==='list_tasks') {
      const a=schemas.list_tasks.parse(input);
      if(a.project_id) this.project(p,a.project_id);
      const rows=this.all(`SELECT tasks.* FROM tasks JOIN projects ON projects.id=tasks.project_id
        WHERE tasks.archived_at IS NULL AND (?='all' OR projects.scope=?)
        AND (? IS NULL OR project_id=?) AND (? IS NULL OR projects.scope=?)
        AND (? IS NULL OR status=?) AND (instr(lower(title),lower(?))>0 OR instr(lower(tasks.code),lower(?))>0)
        AND tasks.id>? ORDER BY tasks.id LIMIT ?`,p.scope,p.scope,a.project_id??null,a.project_id??null,a.scope??null,a.scope??null,a.status??null,a.status??null,a.query??'',a.query??'',a.cursor??'',a.limit+1);
      return this.page(rows,a.limit);
    }
    const a=schemas.get_task_context.extend({cursor:z.uuid().optional(),limit:z.number().default(20)}).parse(input);
    const t=this.task(p,a.task_id);
    if(a.include_private&&!p.read_private) fail(403,'FORBIDDEN');
    if(command==='get_task') return this.view(t);
    if(command==='get_task_context') {
      const latest=this.one('SELECT * FROM checkpoints WHERE task_id=? ORDER BY task_version DESC LIMIT 1',t.id);
      return {task:this.view(t),checkpoint:latest?this.checkpointView(latest,a.include_private):null};
    }
    let before=Number.MAX_SAFE_INTEGER;
    if(a.cursor) {
      const cursor=this.one('SELECT task_version FROM checkpoints WHERE id=? AND task_id=?',a.cursor,t.id);
      if(!cursor) fail(400,'INVALID_CURSOR');
      before=Number(cursor!.task_version);
    }
    const rows=this.all('SELECT * FROM checkpoints WHERE task_id=? AND task_version<? ORDER BY task_version DESC LIMIT ?',t.id,before,a.limit+1);
    return {items:rows.slice(0,a.limit).map(r=>this.checkpointView(r,a.include_private)),next_cursor:rows.length>a.limit?rows[a.limit-1].id:null};
  }
  page(rows:Row[],limit:number) { return {items:rows.slice(0,limit),next_cursor:rows.length>limit?rows[limit-1].id:null}; }
  write(command:Command,input:unknown,p:Principal):unknown {
    if(command==='create_project') {
      const a=schemas.create_project.parse(input);
      if(p.scope!=='all'&&p.scope!==a.scope) fail(403,'FORBIDDEN');
      const id=randomUUID();
      if(this.one('SELECT id FROM projects WHERE code=?',a.code)) fail(409,'CODE_EXISTS');
      this.run('INSERT INTO projects(id,code,name,scope,completion_rule) VALUES(?,?,?,?,?)',id,a.code,a.name,a.scope,a.completion_rule??(a.scope==='work'?'production_release':'evidence'));
      return this.project(p,id);
    }
    if(command==='update_project') {
      const a=schemas.update_project.parse(input),project=this.project(p,a.project_id); this.version(project,a.base_version);
      this.run('UPDATE projects SET name=?,completion_rule=?,version=version+1 WHERE id=?',a.name??project.name,a.completion_rule??project.completion_rule,a.project_id);
      return this.project(p,a.project_id);
    }
    if(command==='open_session') {
      const a=schemas.open_session.parse(input),id=randomUUID();
      this.run('INSERT INTO sessions VALUES(?,?,?,?)',id,p.id,a.label,now()); return {id,label:a.label};
    }
    if(command==='create_task') {
      const a=schemas.create_task.parse(input),project=this.project(p,a.project_id),id=randomUUID();
      if(project.archived_at) fail(409,'PROJECT_ARCHIVED');
      const count=Number(this.one('SELECT count(*) AS n FROM tasks WHERE project_id=?',a.project_id)?.n);
      this.run('INSERT INTO tasks(id,code,project_id,title,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)',id,project.code+'-'+(count+1),a.project_id,a.title,'todo',now(),now());
      a.checklist.forEach((text,i)=>this.run('INSERT INTO checklist_items VALUES(?,?,?,?,?)',randomUUID(),id,text,i,0));
      return this.view(this.task(p,id));
    }
    const id=(input as {task_id:string}).task_id,t=this.task(p,id); this.writable(t);
    if(command==='claim_task') {
      const a=schemas.claim_task.parse(input); this.session(p,a.session_id); this.version(t,a.base_version);
      if(t.owner_session_id&&t.owner_session_id!==a.session_id) fail(409,'TASK_OWNED');
      if(!t.owner_session_id) this.run("UPDATE tasks SET owner_session_id=?,generation=generation+1,version=version+1,status=CASE WHEN status='todo' THEN 'in_progress' ELSE status END,updated_at=? WHERE id=? AND owner_session_id IS NULL",a.session_id,now(),id);
      return this.view(this.task(p,id));
    }
    if(command==='update_task') {
      const a=schemas.update_task.parse(input); this.owner(p,t,a);
      if(a.status==='done'&&(!a.completion_evidence||a.completion_evidence.kind!==t.completion_rule)) fail(400,'COMPLETION_EVIDENCE_REQUIRED');
      if(a.checklist) {
        const existing=new Set(this.items(id).map(x=>x.id)),seen=new Set<string>();
        for(const item of a.checklist) if(item.id) { if(!existing.has(item.id)||seen.has(item.id)) fail(400,'INVALID_CHECKLIST'); seen.add(item.id); }
        this.run('DELETE FROM checklist_items WHERE task_id=?',id);
        a.checklist.forEach((item,i)=>this.run('INSERT INTO checklist_items VALUES(?,?,?,?,?)',item.id??randomUUID(),id,item.text,i,Number(item.done)));
      }
      this.run('UPDATE tasks SET title=?,status=?,completion_evidence=?,version=version+1,updated_at=? WHERE id=?',a.title??t.title,a.status??t.status,a.completion_evidence?JSON.stringify(a.completion_evidence):t.completion_evidence,now(),id);
      return this.view(this.task(p,id));
    }
    if(command==='release_task') {
      const a=schemas.release_task.parse(input); this.owner(p,t,a);
      this.run('UPDATE tasks SET owner_session_id=NULL,generation=generation+1,version=version+1,updated_at=? WHERE id=?',now(),id);
      return this.view(this.task(p,id));
    }
    const a=schemas.save_checkpoint.parse(input); this.owner(p,t,a);
    if(a.private_note!==undefined&&!p.read_private) fail(403,'FORBIDDEN');
    const seen=new Set<string>();
    for(const item of a.checklist) {
      if(seen.has(item.id)) fail(400,'INVALID_CHECKLIST'); seen.add(item.id);
      if(this.run('UPDATE checklist_items SET done=? WHERE id=? AND task_id=?',Number(item.done),item.id,id).changes!==1) fail(400,'INVALID_CHECKLIST');
    }
    const cp=randomUUID(),version=t.version+1;
    const previous=this.one('SELECT private_notes.body FROM private_notes JOIN checkpoints ON checkpoints.id=private_notes.checkpoint_id WHERE task_id=? ORDER BY task_version DESC LIMIT 1',id);
    this.run('INSERT INTO checkpoints VALUES(?,?,?,?,?,?,?,?,?,?,?)',cp,id,version,a.session_id,a.done,a.next,a.blocker,a.decisions,JSON.stringify(a.evidence),JSON.stringify(this.items(id)),now());
    this.run('INSERT INTO private_notes VALUES(?,?)',cp,a.private_note??previous?.body??'');
    this.run('UPDATE tasks SET version=?,owner_session_id=?,generation=?,updated_at=? WHERE id=?',version,a.end_session?null:t.owner_session_id,t.generation+(a.end_session?1:0),now(),id);
    return {task_id:id,checkpoint_id:cp,version,generation:t.generation+(a.end_session?1:0),owner_session_id:a.end_session?null:t.owner_session_id,status:t.status};
  }
  closeOwner(input:unknown) {
    const a=closeSchema.parse(input);
    return this.mutate('local-owner',a.operation_id,'close_owner',a,()=>{
      const t=this.task({id:'local-owner',scope:'all',read_private:1},a.task_id); this.version(t,a.base_version);
      if(t.owner_session_id!==a.expected_owner_session_id||t.generation!==a.expected_generation) fail(409,'OWNER_CHANGED');
      this.run('UPDATE tasks SET owner_session_id=NULL,generation=generation+1,version=version+1,updated_at=? WHERE id=?',now(),t.id);
      return {id:t.id,version:t.version+1};
    });
  }
  archive(input:unknown) {
    const a=archiveSchema.parse(input);
    return this.mutate('local-owner',a.operation_id,'archive',a,()=>{
      const t=this.task({id:'local-owner',scope:'all',read_private:1},a.task_id); this.version(t,a.base_version);
      if(t.owner_session_id) fail(409,'TASK_OWNED');
      this.run('UPDATE tasks SET archived_at=?,version=version+1,updated_at=? WHERE id=?',now(),now(),t.id);
      return {id:t.id,version:t.version+1};
    });
  }
  close() { this.db.close(); }
}
