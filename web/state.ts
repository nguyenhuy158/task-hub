import { z } from 'zod';
import { schemas, closeSchema } from '../src/contracts';
import type { Context } from './api';

export const pendingSchema = z.discriminatedUnion('command', [
  z.object({ command: z.literal('open_session'), input: schemas.open_session }),
  z.object({ command: z.literal('create_project'), input: schemas.create_project }),
  z.object({ command: z.literal('create_task'), input: schemas.create_task }),
  z.object({ command: z.literal('claim_task'), input: schemas.claim_task }),
  z.object({ command: z.literal('save_checkpoint'), input: schemas.save_checkpoint }),
  z.object({ command: z.literal('update_task'), input: schemas.update_task }),
  z.object({ command: z.literal('release_task'), input: schemas.release_task }),
  z.object({ command: z.literal('close_owner'), input: closeSchema }),
]);
export type Pending = z.infer<typeof pendingSchema>;
export const draftSchema = z.object({
  task_id: z.uuid(), base_version: z.number().int().positive(), generation: z.number().int().positive(), session_id: z.uuid(),
  done: z.string().max(4000), next: z.string().max(1000), blocker: z.string().max(4000), decisions: z.string().max(4000),
  evidence: z.string().max(2000), private_note: z.string().max(4000),
  checklist: z.array(z.object({ id: z.uuid(), done: z.boolean(), text: z.string().max(500).default('Mục checklist') })).max(200),
});
export type Draft = z.infer<typeof draftSchema>;
export const key = (sub: string, name: string) => 'task-hub:' + sub + ':' + name;

export function readStored<T>(storage: Pick<Storage, 'getItem'>, name: string, schema: z.ZodType<T>): T | null {
  const value = storage.getItem(name);
  if (value === null) return null;
  return schema.parse(JSON.parse(value));
}

export function newDraft(context: Context, session: string): Draft {
  return {
    task_id: context.task.id, base_version: context.task.version, generation: context.task.generation, session_id: session,
    done: '', next: context.checkpoint?.next ?? '', blocker: '', decisions: '', evidence: '',
    private_note: context.checkpoint?.private_note ?? '', checklist: context.task.checklist.map(({ id, done, text }) => ({ id, done, text })),
  };
}

export function draftIsCurrent(draft: Draft, context: Context, session: string | null) {
  return draft.task_id === context.task.id && draft.base_version === context.task.version && draft.generation === context.task.generation
    && draft.session_id === session && session === context.task.owner_session_id;
}

export function rebaseDraft(draft: Draft, context: Context, session: string): Draft {
  return { ...draft, task_id: context.task.id, base_version: context.task.version, generation: context.task.generation, session_id: session,
    checklist: context.task.checklist.map(item => ({ id: item.id, text: item.text, done: draft.checklist.find(old => old.id === item.id)?.done ?? item.done })) };
}

export function checkpointRequest(draft: Draft, operation_id: string, end_session: boolean): Pending {
  const { evidence, checklist, ...input } = draft;
  return pendingSchema.parse({ command: 'save_checkpoint', input: { ...input, operation_id, end_session,
    checklist: checklist.map(({ id, done }) => ({ id, done })),
    evidence: evidence.trim() ? [{ kind: 'text', value: evidence.trim() }] : [],
  } });
}
