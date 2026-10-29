import { Body, Controller, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { createAgentSchema, updateAgentSchema, createAgentRunSchema, decideApprovalSchema, githubIntegrationSchema, TOOL_CATALOG, AGENT_WORKFLOW_LABEL } from '@space/shared';
import { Org, OrgContext } from '../common/context';
import { UuidPipe, zp } from '../common/zod';
import { AgentsService } from './agents.service';
import { getProvider } from './providers';

@Controller('orgs/:orgId')
export class AgentsController {
  constructor(private readonly svc: AgentsService) {}

  @Get('agents')
  list(@Org() ctx: OrgContext) {
    return this.svc.list(ctx);
  }
  @Get('agents/meta')
  meta() {
    const p = getProvider();
    return { tools: TOOL_CATALOG, workflows: AGENT_WORKFLOW_LABEL, provider: p ? { name: p.name, model: p.model } : null };
  }
  @Post('agents')
  create(@Org() ctx: OrgContext, @Body(zp(createAgentSchema)) b: z.infer<typeof createAgentSchema>) {
    return this.svc.create(ctx, b);
  }
  @Get('agents/:id')
  get(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string) {
    return this.svc.get(ctx, id);
  }
  @Patch('agents/:id')
  update(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Body(zp(updateAgentSchema)) b: z.infer<typeof updateAgentSchema>) {
    return this.svc.update(ctx, id, b);
  }
  @Post('agents/:id/runs')
  run(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Body(zp(createAgentRunSchema)) b: z.infer<typeof createAgentRunSchema>) {
    return this.svc.createRun(ctx, id, b);
  }
  @Get('agent-runs')
  runs(@Org() ctx: OrgContext, @Query('agentId') agentId?: string, @Query('departmentId') departmentId?: string) {
    const ok = (v?: string) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : undefined);
    return this.svc.listRuns(ctx, ok(agentId), ok(departmentId));
  }
  @Get('agent-runs/:runId')
  getRun(@Org() ctx: OrgContext, @Param('runId', UuidPipe) id: string) {
    return this.svc.getRun(ctx, id);
  }
  @Post('agent-runs/:runId/cancel')
  @HttpCode(200)
  cancel(@Org() ctx: OrgContext, @Param('runId', UuidPipe) id: string) {
    return this.svc.cancelRun(ctx, id);
  }
  @Get('agent-approvals')
  approvals(@Org() ctx: OrgContext) {
    return this.svc.pendingApprovals(ctx);
  }
  @Post('agent-approvals/:id/decision')
  @HttpCode(200)
  decide(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Body(zp(decideApprovalSchema)) b: z.infer<typeof decideApprovalSchema>) {
    return this.svc.decide(ctx, id, b);
  }
  @Get('integrations/github')
  github(@Org() ctx: OrgContext) {
    return this.svc.getGithub(ctx);
  }
  @Put('integrations/github')
  setGithub(@Org() ctx: OrgContext, @Body(zp(githubIntegrationSchema)) b: z.infer<typeof githubIntegrationSchema>) {
    return this.svc.setGithub(ctx, b);
  }
}
