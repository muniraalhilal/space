import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  createProjectSchema,
  updateProjectSchema,
  createTaskSchema,
  updateTaskSchema,
  taskQuerySchema,
  addDependencySchema,
  createCommentSchema,
} from '@space/shared';
import { Org, OrgContext } from '../common/context';
import { UuidPipe, zp } from '../common/zod';
import { TasksService } from './tasks.service';
import { ProjectsService } from '../projects/projects.service';

@Controller('orgs/:orgId/projects')
export class ProjectsController {
  constructor(private readonly svc: ProjectsService) {}

  @Get()
  list(@Org() ctx: OrgContext, @Query('departmentId') departmentId?: string) {
    return this.svc.list(ctx, departmentId && /^[0-9a-f-]{36}$/i.test(departmentId) ? departmentId : undefined);
  }
  @Post()
  create(@Org() ctx: OrgContext, @Body(zp(createProjectSchema)) b: z.infer<typeof createProjectSchema>) {
    return this.svc.create(ctx, b);
  }
  @Get(':id')
  get(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string) {
    return this.svc.get(ctx, id);
  }
  @Patch(':id')
  update(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Body(zp(updateProjectSchema)) b: z.infer<typeof updateProjectSchema>) {
    return this.svc.update(ctx, id, b);
  }
  @Delete(':id')
  remove(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string) {
    return this.svc.remove(ctx, id);
  }
}

@Controller('orgs/:orgId/tasks')
export class TasksController {
  constructor(private readonly svc: TasksService) {}

  @Get()
  list(@Org() ctx: OrgContext, @Query(zp(taskQuerySchema)) q: z.infer<typeof taskQuerySchema>) {
    return this.svc.list(ctx, q);
  }
  @Post()
  create(@Org() ctx: OrgContext, @Body(zp(createTaskSchema)) b: z.infer<typeof createTaskSchema>) {
    return this.svc.create(ctx, b);
  }
  @Get(':id')
  get(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string) {
    return this.svc.get(ctx, id);
  }
  @Patch(':id')
  update(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Body(zp(updateTaskSchema)) b: z.infer<typeof updateTaskSchema>) {
    return this.svc.update(ctx, id, b);
  }
  @Delete(':id')
  remove(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string) {
    return this.svc.remove(ctx, id);
  }
  @Post(':id/dependencies')
  addDep(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Body(zp(addDependencySchema)) b: z.infer<typeof addDependencySchema>) {
    return this.svc.addDependency(ctx, id, b.dependsOnId);
  }
  @Delete(':id/dependencies/:depId')
  removeDep(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Param('depId', UuidPipe) depId: string) {
    return this.svc.removeDependency(ctx, id, depId);
  }
  @Post(':id/comments')
  comment(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Body(zp(createCommentSchema)) b: z.infer<typeof createCommentSchema>) {
    return this.svc.addComment(ctx, id, b.body);
  }
}
