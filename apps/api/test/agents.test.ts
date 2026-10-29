import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeApp, deptId, login, orgIds } from './helpers';
import { ScriptedTestProvider, setTestProvider, type Msg, type ModelResponse } from '../src/agents/providers';
import { executeRun } from '../src/agents/executor';

let J: string;
let dev: string;
let mkt: string;
let codenest: string;
let devTask: string;
let mktTask: string;

beforeAll(async () => {
  const munira = await login('munira@juniper.demo');
  J = (await orgIds(munira)).juniper!;
  dev = await deptId(munira, J, 'Development');
  mkt = await deptId(munira, J, 'Marketing');
  const agents = await munira.get(`/orgs/${J}/agents`).expect(200);
  codenest = agents.body.find((a: any) => a.name === 'CodeNest').id;
  devTask = (await munira.get(`/orgs/${J}/tasks?departmentId=${dev}`).expect(200)).body[0].id;
  mktTask = (await munira.get(`/orgs/${J}/tasks?departmentId=${mkt}`).expect(200)).body[0].id;
});
afterEach(() => setTestProvider(null));
afterAll(closeApp);

const startRun = (c: Awaited<ReturnType<typeof login>>, departmentId: string, instruction = 'Summarise open work') =>
  c.post(`/orgs/${J}/agents/${codenest}/runs`, { departmentId, instruction, workflow: 'llm' });

describe('agent authorization', () => {
  it('viewers cannot run agents', async () => {
    const sultan = await login('sultan@juniper.demo');
    const r = await startRun(sultan, dev);
    expect([403, 404]).toContain(r.status);
  });

  it('a department agent only runs inside its own department', async () => {
    const lina = await login('lina@juniper.demo'); // Marketing admin
    await startRun(lina, mkt).expect(403);
    await startRun(lina, dev).expect(403);
  });
});

describe('agent execution (no fake results)', () => {
  it('fails honestly when no AI provider is configured', async () => {
    const sara = await login('sara@juniper.demo');
    const r = await startRun(sara, dev).expect(201);
    await executeRun(r.body.id);
    const run = await sara.get(`/orgs/${J}/agent-runs/${r.body.id}`).expect(200);
    expect(run.body.status).toBe('failed');
    expect(run.body.error).toMatch(/No AI model provider is configured/);
    expect(run.body.result ?? null).toBeNull();
  });

  it('enforces tool grants, department scope and human approval for writes', async () => {
    const turn = (messages: Msg[]) => messages.filter((m) => m.role === 'assistant').length;
    const use = (id: string, name: string, input: object): ModelResponse => ({ content: [{ type: 'tool_use', id, name, input }], stopReason: 'tool_use', inputTokens: 100, outputTokens: 20 });
    setTestProvider(
      new ScriptedTestProvider((messages) => {
        switch (turn(messages)) {
          case 0:
            return use('t1', 'get_task', { task_id: mktTask }); // another department's task
          case 1:
            return use('t2', 'department_stats', {}); // tool CodeNest was never granted
          case 2:
            return use('t3', 'add_task_comment', { task_id: devTask, body: 'Automated summary: two items are blocked.' }); // write → approval
          default:
            return { content: [{ type: 'text', text: 'Done: left a summary comment.' }], stopReason: 'end_turn', inputTokens: 50, outputTokens: 10 };
        }
      }),
    );
    const sara = await login('sara@juniper.demo');
    const faisal = await login('faisal@juniper.demo');
    const r = await startRun(sara, dev, 'Summarise blocked work and comment on the task').expect(201);
    const runId = r.body.id;

    expect(await executeRun(runId)).toBe('paused');
    let run = await sara.get(`/orgs/${J}/agent-runs/${runId}`).expect(200);
    expect(run.body.status).toBe('awaiting_approval');
    const results = run.body.stepLog.filter((s: any) => s.kind === 'tool_result');
    expect(results[0].content.ok === false || JSON.stringify(results[0].content).match(/not found|denied|not in/i)).toBeTruthy();
    expect(results[1].content.denied).toBe(true);
    // Nothing was written yet.
    const before = await sara.get(`/orgs/${J}/tasks/${devTask}`).expect(200);
    expect(JSON.stringify(before.body.comments ?? [])).not.toContain('Automated summary');

    const approval = run.body.approvals.find((a: any) => a.status === 'pending');
    expect(approval.toolName).toBe('add_task_comment');
    await sara.post(`/orgs/${J}/agent-approvals/${approval.id}/decision`, { decision: 'approve' }).expect(403); // employees can't approve
    await faisal.post(`/orgs/${J}/agent-approvals/${approval.id}/decision`, { decision: 'approve' }).expect(200);

    expect(await executeRun(runId)).toBe('finished');
    run = await sara.get(`/orgs/${J}/agent-runs/${runId}`).expect(200);
    expect(run.body.status).toBe('succeeded');
    expect(run.body.result).toBe('Done: left a summary comment.');
    expect(run.body.steps).toBe(4);
    const after = await sara.get(`/orgs/${J}/tasks/${devTask}`).expect(200);
    expect(JSON.stringify(after.body)).toContain('Automated summary: two items are blocked.');
  });

  it('a denied approval is reported to the model and nothing is written', async () => {
    let sawDenial = false;
    setTestProvider(
      new ScriptedTestProvider((messages) => {
        const n = messages.filter((m) => m.role === 'assistant').length;
        if (n === 0) return { content: [{ type: 'tool_use', id: 'w1', name: 'create_subtask', input: { parent_task_id: devTask, title: 'Should never exist' } }], stopReason: 'tool_use', inputTokens: 10, outputTokens: 5 };
        sawDenial = JSON.stringify(messages[messages.length - 1]).includes('denied');
        return { content: [{ type: 'text', text: 'Understood, no changes made.' }], stopReason: 'end_turn', inputTokens: 10, outputTokens: 5 };
      }),
    );
    const sara = await login('sara@juniper.demo');
    const faisal = await login('faisal@juniper.demo');
    const r = await startRun(sara, dev).expect(201);
    expect(await executeRun(r.body.id)).toBe('paused');
    const run = await sara.get(`/orgs/${J}/agent-runs/${r.body.id}`).expect(200);
    const approval = run.body.approvals.find((a: any) => a.status === 'pending');
    await faisal.post(`/orgs/${J}/agent-approvals/${approval.id}/decision`, { decision: 'deny' }).expect(200);
    await executeRun(r.body.id);
    expect(sawDenial).toBe(true);
    const tasks = await sara.get(`/orgs/${J}/tasks?departmentId=${dev}`).expect(200);
    expect(JSON.stringify(tasks.body)).not.toContain('Should never exist');
  });

  it('a cancelled run never executes', async () => {
    let called = false;
    setTestProvider(
      new ScriptedTestProvider(() => {
        called = true;
        return { content: [{ type: 'text', text: 'x' }], stopReason: 'end_turn', inputTokens: 1, outputTokens: 1 };
      }),
    );
    const sara = await login('sara@juniper.demo');
    const r = await startRun(sara, dev).expect(201);
    await sara.post(`/orgs/${J}/agent-runs/${r.body.id}/cancel`).expect(200);
    expect(await executeRun(r.body.id)).toBe('skipped');
    expect(called).toBe(false);
    const run = await sara.get(`/orgs/${J}/agent-runs/${r.body.id}`).expect(200);
    expect(run.body.status).toBe('cancelled');
  });
});
