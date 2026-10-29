import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { createRequestSchema, transitionRequestSchema, createCommentSchema } from '@space/shared';
import { Org, OrgContext } from '../common/context';
import { UuidPipe, zp } from '../common/zod';
import { RequestsService } from './requests.service';

@Controller('orgs/:orgId/requests')
export class RequestsController {
  constructor(private readonly svc: RequestsService) {}

  @Get()
  list(@Org() ctx: OrgContext, @Query('box') box?: string, @Query('state') state?: string) {
    const b = box === 'incoming' || box === 'outgoing' ? box : 'all';
    return this.svc.list(ctx, b, state);
  }
  @Post()
  create(@Org() ctx: OrgContext, @Body(zp(createRequestSchema)) b: z.infer<typeof createRequestSchema>) {
    return this.svc.create(ctx, b);
  }
  @Get(':id')
  get(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string) {
    return this.svc.get(ctx, id);
  }
  @Post(':id/transitions')
  transition(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Body(zp(transitionRequestSchema)) b: z.infer<typeof transitionRequestSchema>) {
    return this.svc.transition(ctx, id, b);
  }
  @Post(':id/comments')
  comment(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Body(zp(createCommentSchema)) b: z.infer<typeof createCommentSchema>) {
    return this.svc.addComment(ctx, id, b.body);
  }
}
