import { z } from 'zod';

const id = z.uuid();
const text = z.string().trim().min(1);
const operation = { operation_id: id };
const version = { ...operation, base_version: z.number().int().positive() };
const task = { task_id: id };
const owned = { ...task, ...version, session_id: id, generation: z.number().int().positive() };
const paging = { cursor: id.optional(), limit: z.number().int().min(1).max(100).default(20) };
const status = z.enum(['todo', 'in_progress', 'blocked', 'done']);
const scope = z.enum(['personal', 'work']);
const evidence = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), value: text.max(2000) }).strict(),
  z.object({ kind: z.literal('url'), value: z.url().max(2000).regex(/^https?:\/\//) }).strict(),
]);
const checklist = z.array(z.object({ id: id.optional(), text: text.max(500), done: z.boolean() }).strict()).max(200);
export const schemas = {
  list_projects: z.object({ ...paging }).strict(),
  create_project: z.object({ ...operation, code: z.string().regex(/^[A-Z][A-Z0-9]{1,11}$/), name: text.max(120), scope, completion_rule: z.enum(['evidence', 'production_release']).optional() }).strict(),
  update_project: z.object({ ...version, project_id: id, name: text.max(120).optional(), completion_rule: z.enum(['evidence', 'production_release']).optional() }).strict(),
  open_session: z.object({ ...operation, label: text.max(120) }).strict(),
  list_tasks: z.object({ ...paging, project_id: id.optional(), scope: scope.optional(), status: status.optional(), query: z.string().max(120).optional() }).strict(),
  create_task: z.object({ ...operation, project_id: id, title: text.max(120), checklist: z.array(text.max(500)).max(200).default([]) }).strict(),
  get_task: z.object(task).strict(),
  get_task_context: z.object({ ...task, include_private: z.boolean().default(false) }).strict(),
  list_checkpoints: z.object({ ...task, ...paging, include_private: z.boolean().default(false) }).strict(),
  claim_task: z.object({ ...task, ...version, session_id: id }).strict(),
  update_task: z.object({ ...owned, title: text.max(120).optional(), checklist: checklist.optional(), status: status.optional(), completion_evidence: z.object({ kind: z.enum(['evidence','production_release']), value: text.max(4000) }).strict().optional() }).strict(),
  save_checkpoint: z.object({ ...owned, done: text.max(4000), next: text.max(1000), blocker: z.string().max(4000).default(''), decisions: z.string().max(4000).default(''), evidence: z.array(evidence).max(20).default([]), checklist: z.array(z.object({ id, done: z.boolean() }).strict()).max(200).default([]), private_note: z.string().max(4000).optional(), end_session: z.boolean().default(false) }).strict(),
  release_task: z.object(owned).strict(),
};
export type Command = keyof typeof schemas;
export const reads = new Set<Command>(['list_projects','list_tasks','get_task','get_task_context','list_checkpoints']);
export const closeSchema = z.object({ ...task, ...version, expected_owner_session_id: id, expected_generation: z.number().int().positive() }).strict();
export const archiveSchema = z.object({ ...task, ...version }).strict();
export const routes: { method: 'GET'|'POST'|'PATCH'; path: string; command: Command }[] = [
  { method:'GET', path:'/projects', command:'list_projects' },
  { method:'POST', path:'/projects', command:'create_project' },
  { method:'PATCH', path:'/projects/:project_id', command:'update_project' },
  { method:'POST', path:'/sessions', command:'open_session' },
  { method:'GET', path:'/tasks', command:'list_tasks' },
  { method:'POST', path:'/tasks', command:'create_task' },
  { method:'GET', path:'/tasks/:task_id', command:'get_task' },
  { method:'GET', path:'/tasks/:task_id/context', command:'get_task_context' },
  { method:'GET', path:'/tasks/:task_id/checkpoints', command:'list_checkpoints' },
  { method:'POST', path:'/tasks/:task_id/claim', command:'claim_task' },
  { method:'PATCH', path:'/tasks/:task_id', command:'update_task' },
  { method:'POST', path:'/tasks/:task_id/checkpoints', command:'save_checkpoint' },
  { method:'POST', path:'/tasks/:task_id/release', command:'release_task' },
];
