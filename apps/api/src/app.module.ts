import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { AllExceptionsFilter } from './common/errors';
import { AuthGuard, Public } from './common/guards';
import { AuditService } from './common/audit.service';
import { AuthController } from './auth/auth.controller';
import { OrgsController } from './orgs/orgs.controller';
import { OrgsService } from './orgs/orgs.service';
import { ProjectsService } from './projects/projects.service';
import { ProjectsController, TasksController } from './tasks/tasks.controller';
import { TasksService } from './tasks/tasks.service';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { MessagesController, MessagesService } from './messages/messages.service';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';
import { FilesController } from './files/files.controller';
import { FilesService } from './files/files.service';
import { CalendarController, CalendarService } from './calendar/calendar.controller';
import { ReportsController, ReportsService } from './reports/reports.controller';
import { AgentsController } from './agents/agents.controller';
import { AgentsService } from './agents/agents.service';
import { RealtimeGateway } from './realtime/gateway';
import { getDb } from './db/client';
import { redisConnection } from './agents/queue';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  async health() {
    const checks: Record<string, 'ok' | 'down'> = { db: 'down', redis: 'down' };
    try {
      await getDb().execute(sql`select 1`);
      checks.db = 'ok';
    } catch {
      /* reported below */
    }
    try {
      checks.redis = (await redisConnection().ping()) === 'PONG' ? 'ok' : 'down';
    } catch {
      /* reported below */
    }
    return { status: Object.values(checks).every((c) => c === 'ok') ? 'ok' : 'degraded', checks, time: new Date().toISOString() };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 600 }])],
  controllers: [
    HealthController,
    AuthController,
    OrgsController,
    ProjectsController,
    TasksController,
    RequestsController,
    MessagesController,
    NotificationsController,
    FilesController,
    CalendarController,
    ReportsController,
    AgentsController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    AuditService,
    OrgsService,
    ProjectsService,
    TasksService,
    RequestsService,
    MessagesService,
    NotificationsService,
    FilesService,
    CalendarService,
    ReportsService,
    AgentsService,
    RealtimeGateway,
  ],
})
export class AppModule {}
