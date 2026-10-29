import { and, eq } from 'drizzle-orm';
import { config } from '../../config';
import { decryptSecret } from '../../common/crypto';
import { getDb, schema } from '../../db/client';
import type { ToolContext } from './index';

/**
 * Minimal GitHub REST client used by agent tools. Enforces the company's repository allow-list
 * on every call; the token is decrypted only inside the worker and never logged or returned.
 */
export class GithubClient {
  constructor(
    private readonly token: string,
    private readonly allowedRepos: string[],
  ) {}

  private check(repo: string) {
    if (!this.allowedRepos.map((r) => r.toLowerCase()).includes(repo.toLowerCase())) {
      throw new Error(`Repository ${repo} is not on this company's allow-list`);
    }
  }

  private async req(path: string, init: RequestInit = {}) {
    const res = await fetch(`${config().GITHUB_API_URL}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'Space-Agent',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json() as Promise<any>;
  }

  async listIssues(repo: string, state: string) {
    this.check(repo);
    const items = await this.req(`/repos/${repo}/issues?state=${state}&per_page=30`);
    return items
      .filter((i: any) => !i.pull_request)
      .map((i: any) => ({ number: i.number, title: i.title, state: i.state, labels: i.labels?.map((l: any) => l.name), author: i.user?.login, created_at: i.created_at, body: (i.body ?? '').slice(0, 1500) }));
  }

  async getPullRequest(repo: string, n: number) {
    this.check(repo);
    const pr = await this.req(`/repos/${repo}/pulls/${n}`);
    const files = await this.req(`/repos/${repo}/pulls/${n}/files?per_page=50`);
    return {
      number: pr.number,
      title: pr.title,
      state: pr.state,
      author: pr.user?.login,
      body: (pr.body ?? '').slice(0, 4000),
      additions: pr.additions,
      deletions: pr.deletions,
      files: files.map((f: any) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: (f.patch ?? '').slice(0, 2500) })),
    };
  }

  async recentCommits(repo: string, limit: number) {
    this.check(repo);
    const cs = await this.req(`/repos/${repo}/commits?per_page=${limit}`);
    return cs.map((c: any) => ({ sha: c.sha.slice(0, 8), message: c.commit?.message?.split('\n')[0], author: c.commit?.author?.name, date: c.commit?.author?.date }));
  }

  async createIssue(repo: string, title: string, body: string) {
    this.check(repo);
    const i = await this.req(`/repos/${repo}/issues`, { method: 'POST', body: JSON.stringify({ title, body }) });
    return { number: i.number, url: i.html_url };
  }
}

export async function loadGithubClient(orgId: string): Promise<GithubClient | null> {
  const db = getDb();
  const [org] = await db.select().from(schema.organizations).where(eq(schema.organizations.id, orgId));
  if (!org?.settings?.allowAgentExternalIntegrations) return null;
  const [i] = await db.select().from(schema.integrations).where(and(eq(schema.integrations.orgId, orgId), eq(schema.integrations.kind, 'github')));
  if (!i || !i.enabled || !i.secretEncrypted) return null;
  return new GithubClient(decryptSecret(i.secretEncrypted), i.config.allowedRepos ?? []);
}

export function github(ctx: ToolContext): GithubClient {
  if (!ctx.github) throw new Error('GitHub integration is not configured or not enabled for this company');
  return ctx.github;
}
