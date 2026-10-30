// Functional checks of the in-page backend (same rules as apps/api tests), run against the built page.
const { chromium, seed: seedText, fake, hostedUrl } = require('./runtime.cjs');
let failures = 0;
const ok = (cond, msg) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
  if (!cond) failures++;
};
(async () => {
  const seed = JSON.parse(seedText);
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(`window.__SPACE_TEST__ = true; window.__SPACE_SEED__ = ${JSON.stringify(seed)};\n${fake}`);
  await page.goto(hostedUrl + '?still=1');
  await page.waitForFunction(() => !!window.__spaceApi, null, { timeout: 30000 });
  const call = (method, p, body) =>
    page.evaluate(
      async ([m, p, b]) => {
        try {
          return { status: 200, body: await window.__spaceApi(m, p, b) };
        } catch (e) {
          return { status: e.status ?? 500, code: e.code, message: e.message };
        }
      },
      [method, p, body],
    );
  const uid = (email) => seed.users.find((u) => u.email === email).id;
  const as = async (email) => ok((await call('POST', '/auth/login', { userId: uid(email) })).status === 200, `sign in as ${email}`);
  const J = seed.organizations.find((o) => o.slug === 'juniper').id;
  const Q = seed.organizations.find((o) => o.slug === 'qamar').id;
  const dept = (name) => seed.departments.find((d) => d.orgId === J && d.name === name).id;
  const dev = dept('Development');
  const mkt = dept('Marketing');
  const fin = dept('Finance');

  ok((await call('GET', '/auth/me')).status === 401, 'no identity → 401');

  await as('sara@juniper.demo');
  ok((await call('GET', `/orgs/${Q}`)).status === 404, 'tenant isolation: other company is 404');
  const qTask = seed.tasks.find((t) => t.orgId === Q);
  ok((await call('GET', `/orgs/${J}/tasks/${qTask.id}`)).status === 404, 'tenant isolation: other company task via own route is 404');
  const tasks = await call('GET', `/orgs/${J}/tasks`);
  ok(tasks.body.length > 0 && tasks.body.every((t) => t.departmentId === dev), 'employee sees only own department tasks');
  const mktTask = seed.tasks.find((t) => t.departmentId === mkt);
  ok((await call('GET', `/orgs/${J}/tasks/${mktTask.id}`)).status === 404, 'other department task hidden');
  const members = await call('GET', `/orgs/${J}/members`);
  ok(members.body.filter((m) => m.name !== 'Sara Alqahtani').every((m) => m.email === undefined), 'emails hidden from non-admins');
  ok((await call('PATCH', `/orgs/${J}`, { name: 'Hijack' })).status === 403, 'employee cannot change company');
  ok((await call('PATCH', `/orgs/${J}/me`, { presence: 'remote' })).status === 200, 'set own presence to remote');
  const devProject = seed.projects.find((p) => p.departmentId === dev);
  const created = await call('POST', `/orgs/${J}/tasks`, { projectId: devProject.id, title: 'Hosted flow task' });
  ok(created.status === 200 && created.body.title === 'Hosted flow task', 'employee creates a task');
  const upd = await call('PATCH', `/orgs/${J}/tasks/${created.body.id}`, { version: 0, status: 'in_progress' });
  ok(upd.status === 200 && upd.body.version === 1, 'update with version');
  ok((await call('PATCH', `/orgs/${J}/tasks/${created.body.id}`, { version: 0, status: 'done' })).status === 409, 'stale version rejected');
  ok((await call('POST', `/orgs/${J}/tasks/${created.body.id}/comments`, { body: 'Looks good' })).status === 200, 'comment on task');
  const other = devProject && seed.tasks.find((t) => t.departmentId === dev && t.id !== created.body.id && !t.parentId);
  ok((await call('POST', `/orgs/${J}/tasks/${created.body.id}/dependencies`, { dependsOnId: other.id })).status === 200, 'add dependency');
  ok((await call('POST', `/orgs/${J}/tasks/${other.id}/dependencies`, { dependsOnId: created.body.id })).status === 422, 'cycle rejected');

  await as('sultan@juniper.demo');
  const finProject = seed.projects.find((p) => p.departmentId === fin);
  ok((await call('POST', `/orgs/${J}/tasks`, { projectId: finProject.id, title: 'Viewer attempt' })).status === 403, 'viewer cannot create tasks');
  ok((await call('GET', `/orgs/${J}/settings`)).status === 404, 'unknown route 404');
  ok((await call('GET', `/orgs/${J}/audit`)).status === 403, 'viewer cannot read audit log');

  // Requests
  await as('sara@juniper.demo');
  ok((await call('POST', `/orgs/${J}/requests`, { fromDepartmentId: mkt, toDepartmentId: dev, title: 'X', description: 'Y' })).status === 403, 'only requesting-dept admins send requests');
  await as('lina@juniper.demo');
  const req = await call('POST', `/orgs/${J}/requests`, { fromDepartmentId: mkt, toDepartmentId: dev, title: 'Launch dashboard', description: 'Track sign-ups', priority: 'high' });
  ok(req.status === 200 && req.body.state === 'submitted', 'request created');
  ok((await call('POST', `/orgs/${J}/requests/${req.body.id}/transitions`, { action: 'accept', version: 0 })).status === 403, 'requester cannot accept own request');
  await as('faisal@juniper.demo');
  const bad = await call('POST', `/orgs/${J}/requests/${req.body.id}/transitions`, { action: 'deliver', version: 0 });
  ok(bad.status === 409 && bad.code === 'INVALID_TRANSITION', 'invalid transition 409');
  let v = 0;
  for (const [who, action, state] of [['faisal', 'accept', 'accepted'], ['faisal', 'start', 'in_progress'], ['faisal', 'deliver', 'delivered'], ['lina', 'approve', 'completed']]) {
    await as(`${who}@juniper.demo`);
    const r = await call('POST', `/orgs/${J}/requests/${req.body.id}/transitions`, { action, version: v, note: action === 'deliver' ? 'Live' : undefined });
    ok(r.status === 200 && r.body.state === state, `request → ${state}`);
    v++;
  }
  const detail = await call('GET', `/orgs/${J}/requests/${req.body.id}`);
  ok(detail.body.events.length === 5, 'request history has 5 events');

  // Department admin limits
  await as('faisal@juniper.demo');
  const outsider = (await call('GET', `/orgs/${J}/members`)).body.find((m) => !m.departments.some((d) => d.departmentId === dev) && m.role === 'employee');
  ok((await call('PUT', `/orgs/${J}/departments/${dev}/members`, { memberId: outsider.id, role: 'admin' })).status === 403, 'dept admin cannot appoint admins');
  ok((await call('PUT', `/orgs/${J}/departments/${dev}/members`, { memberId: outsider.id, role: 'member' })).status === 200, 'dept admin adds member');

  // Messages + notifications
  const conv = await call('POST', `/orgs/${J}/conversations`, { memberId: outsider.id });
  ok(conv.status === 200, 'open DM');
  ok((await call('POST', `/orgs/${J}/conversations/${conv.body.id}/messages`, { body: 'Welcome to Development!' })).status === 200, 'send message');
  const notifs = await call('GET', `/orgs/${J}/notifications`);
  ok(notifs.status === 200 && typeof notifs.body.unread === 'number', 'notifications list');

  // Company admin
  await as('munira@juniper.demo');
  const inv = await call('POST', `/orgs/${J}/members`, { email: 'new.person@juniper.demo', name: 'New Person', role: 'employee', departmentId: dev, departmentRole: 'member' });
  ok(inv.status === 200 && inv.body.memberId, 'company admin adds a member');
  const qMembers = await call('GET', `/orgs/${Q}/members`);
  const meQ = qMembers.body.find((m) => m.name === 'Munira Alhilal');
  ok((await call('PATCH', `/orgs/${Q}/members/${meQ.id}`, { role: 'employee' })).status === 409, 'last company admin cannot demote self');
  ok((await call('PATCH', `/orgs/${J}`, { accentColor: '#f3c48b' })).status === 200, 'company admin updates settings');
  ok((await call('GET', `/orgs/${J}/audit`)).body.some((a) => a.action === 'org.update'), 'audit log records change');
  const report = await call('GET', `/orgs/${J}/reports/summary?days=14`);
  ok(report.status === 200 && report.body.departments.length >= 8, 'reports summary');
  ok((await call('GET', `/orgs/${J}/reports/activity?limit=5`)).body.length === 5, 'recent activity');
  const cal = await call('GET', `/orgs/${J}/calendar?from=${new Date(Date.now() - 86400e3).toISOString()}&to=${new Date(Date.now() + 7 * 86400e3).toISOString()}`);
  ok(cal.status === 200 && cal.body.events.length > 0, 'calendar range');

  // Agents
  const agents = (await call('GET', `/orgs/${J}/agents`)).body;
  const codenest = agents.find((a) => a.name === 'CodeNest');
  await as('sultan@juniper.demo');
  ok((await call('POST', `/orgs/${J}/agents/${codenest.id}/runs`, { departmentId: dev, instruction: 'Summarise work', workflow: 'llm' })).status === 403, 'viewer cannot run agents');
  await as('lina@juniper.demo');
  ok((await call('POST', `/orgs/${J}/agents/${codenest.id}/runs`, { departmentId: mkt, instruction: 'Summarise work', workflow: 'llm' })).status === 403, 'dept agent only in own dept');

  await as('faisal@juniper.demo');
  const rep = await call('POST', `/orgs/${J}/agents/${codenest.id}/runs`, { departmentId: dev, instruction: 'Weekly report', workflow: 'department_report' });
  ok(rep.status === 200, 'start built-in report');
  await page.waitForTimeout(800);
  const repRun = await call('GET', `/orgs/${J}/agent-runs/${rep.body.id}`);
  ok(repRun.body.status === 'succeeded' && /status report/.test(repRun.body.result), 'built-in report succeeded with real figures');

  // Model-driven run with a scripted stand-in for Claude that calls the page tools.
  await page.evaluate(([mktTaskId, devTaskId]) => {
    window.__SAMPLE_SCRIPT__ = async (input, opts) => {
      const t = Object.fromEntries((opts.tools || []).map((x) => [x.name, x]));
      const res = [];
      try {
        await t.get_task.execute({ task_id: mktTaskId }, {});
      } catch (e) {
        res.push('cross-dept:' + e.message);
      }
      res.push('notgranted:' + (t.department_stats ? 'present' : 'absent'));
      res.push('comment:' + (await t.add_task_comment.execute({ task_id: devTaskId, body: 'Agent summary comment' }, {})));
      return { text: 'Summary: ' + res.join(' | '), truncated: false };
    };
  }, [mktTask.id, other.id]);
  const llm = await call('POST', `/orgs/${J}/agents/${codenest.id}/runs`, { departmentId: dev, instruction: 'Comment a summary on the task', workflow: 'llm' });
  ok(llm.status === 200, 'start model-driven run');
  await page.waitForTimeout(1200);
  let run = (await call('GET', `/orgs/${J}/agent-runs/${llm.body.id}`)).body;
  ok(run.status === 'awaiting_approval', 'write waits for approval');
  ok(/cross-dept:Task not found in this department/.test(run.result), 'cross-department read refused');
  ok(/notgranted:absent/.test(run.result), 'ungranted tool not offered');
  let task = (await call('GET', `/orgs/${J}/tasks/${other.id}`)).body;
  ok(!JSON.stringify(task.comments).includes('Agent summary comment'), 'nothing written before approval');
  const appr = run.approvals.find((a) => a.status === 'pending');
  await as('sara@juniper.demo');
  ok((await call('POST', `/orgs/${J}/agent-approvals/${appr.id}/decision`, { decision: 'approve' })).status === 403, 'employee cannot approve');
  await as('faisal@juniper.demo');
  ok((await call('POST', `/orgs/${J}/agent-approvals/${appr.id}/decision`, { decision: 'approve' })).status === 200, 'dept admin approves');
  run = (await call('GET', `/orgs/${J}/agent-runs/${llm.body.id}`)).body;
  ok(run.status === 'succeeded', 'run finishes after approval');
  task = (await call('GET', `/orgs/${J}/tasks/${other.id}`)).body;
  ok(task.comments.filter((c) => c.body === 'Agent summary comment').length === 1, 'comment written exactly once');

  await page.evaluate(() => (window.__SAMPLE_SCRIPT__ = null));
  const nogrant = await call('POST', `/orgs/${J}/agents/${codenest.id}/runs`, { departmentId: dev, instruction: 'Anything', workflow: 'llm' });
  await page.waitForTimeout(800);
  const ng = (await call('GET', `/orgs/${J}/agent-runs/${nogrant.body.id}`)).body;
  ok(ng.status === 'failed' && /wasn’t allowed/.test(ng.error), 'declined Claude consent fails honestly');

  // Read-only viewers of the artifact
  await page.evaluate(() => (window.__SPACE_READONLY__ = true));
  const ro = await call('PATCH', `/orgs/${J}/me`, { presence: 'working' });
  ok(ro.status === 503 && /view-only/.test(ro.message), 'view-only artifact access cannot write');

  console.log(`\n${failures ? failures + ' FAILED' : 'ALL PASSED'}; page errors: ${errors.length ? errors.join(' | ') : 'none'}`);
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
