/**
 * Isolated AI execution worker. Runs as its own process (and container in production) so model
 * calls, tool execution and external integrations never share the API's request lifecycle.
 */
import 'reflect-metadata';
import { Worker } from 'bullmq';
import { and, eq, lt, sql } from 'drizzle-orm';
import { config } from './config';
import { AGENT_QUEUE, redisConnection, enqueueRun } from './agents/queue';
import { executeRun, RetryableRunError } from './agents/executor';
import { getDb, schema, closeDb } from './db/client';
import { closeBus, publish } from './realtime/bus';

const log = (...a: unknown[]) => console.log(new Date().toISOString(), '[worker]', ...a);

async function main() {
  const worker = new Worker(
    AGENT_QUEUE,
    async (job) => {
      const runId = String(job.data?.runId ?? '');
      if (!/^[0-9a-f-]{36}$/i.test(runId)) return;
      try {
        const outcome = await executeRun(runId);
        log(`run ${runId} -> ${outcome}`);
      } catch (e) {
        if (e instanceof RetryableRunError) throw e; // let BullMQ back off and retry
        log(`run ${runId} crashed`, e);
      }
    },
    { connection: redisConnection(), concurrency: config().AGENT_WORKER_CONCURRENCY },
  );

  worker.on('failed', async (job, err) => {
    // After the final retry, mark the run failed instead of leaving it queued forever.
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      const runId = String(job.data?.runId);
      const [r] = await getDb()
        .update(schema.agentRuns)
        .set({ status: 'failed', error: `Gave up after retries: ${err.message}`, finishedAt: new Date() })
        .where(and(eq(schema.agentRuns.id, runId), eq(schema.agentRuns.status, 'queued')))
        .returning();
      if (r) publish({ type: 'agent_run.changed', orgId: r.orgId, deptId: r.departmentId, runId: r.id, agentId: r.agentId, status: 'failed' });
    }
  });

  // Crash recovery: runs left "running" by a dead worker are marked timed out.
  const sweep = setInterval(async () => {
    const cutoff = new Date(Date.now() - config().AGENT_RUN_TIMEOUT_SEC * 2000);
    const stale = await getDb()
      .update(schema.agentRuns)
      .set({ status: 'timed_out', error: 'Worker stopped responding', finishedAt: new Date() })
      .where(and(eq(schema.agentRuns.status, 'running'), lt(schema.agentRuns.startedAt, cutoff), sql`${schema.agentRuns.finishedAt} is null`))
      .returning();
    stale.forEach((r) => publish({ type: 'agent_run.changed', orgId: r.orgId, deptId: r.departmentId, runId: r.id, agentId: r.agentId, status: 'timed_out' }));
    // Re-deliver queued runs whose job may have been lost (e.g. Redis restart). Claiming is atomic, so duplicates are no-ops.
    const orphaned = await getDb()
      .select({ id: schema.agentRuns.id })
      .from(schema.agentRuns)
      .where(and(eq(schema.agentRuns.status, 'queued'), lt(schema.agentRuns.createdAt, new Date(Date.now() - 120_000))));
    for (const o of orphaned) await enqueueRun(o.id, `sweep-${Math.floor(Date.now() / 600_000)}`);
  }, 60_000);

  log(`listening on queue "${AGENT_QUEUE}" (provider: ${config().AI_PROVIDER})`);
  const shutdown = async () => {
    clearInterval(sweep);
    await worker.close();
    await closeBus();
    await closeDb();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
