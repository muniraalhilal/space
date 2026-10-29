import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { config } from '../config';

export const AGENT_QUEUE = 'agent-runs';

let conn: IORedis | null = null;
export function redisConnection() {
  if (!conn) conn = new IORedis(config().REDIS_URL, { maxRetriesPerRequest: null });
  return conn;
}

let queue: Queue | null = null;
export function agentQueue() {
  if (!queue) {
    queue = new Queue(AGENT_QUEUE, {
      connection: redisConnection(),
      defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 },
    });
  }
  return queue;
}

/** Enqueue (or re-enqueue after an approval decision). Job ids make duplicate enqueues harmless. */
export async function enqueueRun(runId: string, attemptTag = 'start') {
  await agentQueue().add('run', { runId }, { jobId: `${runId}_${attemptTag}` });
}

export async function closeQueue() {
  await queue?.close().catch(() => undefined);
  await conn?.quit().catch(() => undefined);
  queue = null;
  conn = null;
}
