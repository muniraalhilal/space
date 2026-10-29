import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { Org, OrgContext } from '../common/context';
import { NotificationsService } from './notifications.service';
import { Errors } from '../common/errors';

@Controller('orgs/:orgId/notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  @Get()
  list(@Org() ctx: OrgContext, @Query('unread') unread?: string) {
    return this.svc.list(ctx, unread === 'true');
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@Org() ctx: OrgContext, @Param('id') id: string) {
    if (id !== 'all' && !/^[0-9a-f-]{36}$/i.test(id)) throw Errors.notFound();
    return this.svc.markRead(ctx, id as any);
  }
}
