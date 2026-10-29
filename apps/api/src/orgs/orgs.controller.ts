import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import {
  createOrgSchema,
  updateOrgSchema,
  inviteMemberSchema,
  updateMemberSchema,
  updateMeInOrgSchema,
  createDepartmentSchema,
  updateDepartmentSchema,
  setDepartmentMemberSchema,
  updateOfficeLayoutSchema,
} from '@space/shared';
import { z } from 'zod';
import { AuthUser, CurrentUser, Org, OrgContext } from '../common/context';
import { UuidPipe, zp } from '../common/zod';
import { OrgsService } from './orgs.service';

@Controller('orgs')
export class OrgsController {
  constructor(private readonly svc: OrgsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body(zp(createOrgSchema)) body: z.infer<typeof createOrgSchema>) {
    return this.svc.create(user, body);
  }

  @Get(':orgId')
  overview(@Org() ctx: OrgContext) {
    return this.svc.overview(ctx);
  }

  @Patch(':orgId')
  update(@Org() ctx: OrgContext, @Body(zp(updateOrgSchema)) body: z.infer<typeof updateOrgSchema>) {
    return this.svc.update(ctx, body);
  }

  @Patch(':orgId/me')
  updateMe(@Org() ctx: OrgContext, @Body(zp(updateMeInOrgSchema)) body: z.infer<typeof updateMeInOrgSchema>) {
    return this.svc.updateMe(ctx, body);
  }

  @Get(':orgId/members')
  members(@Org() ctx: OrgContext) {
    return this.svc.listMembers(ctx);
  }

  @Post(':orgId/members')
  invite(@Org() ctx: OrgContext, @Body(zp(inviteMemberSchema)) body: z.infer<typeof inviteMemberSchema>) {
    return this.svc.invite(ctx, body);
  }

  @Patch(':orgId/members/:memberId')
  updateMember(@Org() ctx: OrgContext, @Param('memberId', UuidPipe) id: string, @Body(zp(updateMemberSchema)) body: z.infer<typeof updateMemberSchema>) {
    return this.svc.updateMember(ctx, id, body);
  }

  @Delete(':orgId/members/:memberId')
  removeMember(@Org() ctx: OrgContext, @Param('memberId', UuidPipe) id: string) {
    return this.svc.removeMember(ctx, id);
  }

  @Get(':orgId/departments')
  departments(@Org() ctx: OrgContext) {
    return this.svc.listDepartments(ctx);
  }

  @Post(':orgId/departments')
  createDepartment(@Org() ctx: OrgContext, @Body(zp(createDepartmentSchema)) body: z.infer<typeof createDepartmentSchema>) {
    return this.svc.createDepartment(ctx, body);
  }

  @Get(':orgId/departments/:deptId')
  department(@Org() ctx: OrgContext, @Param('deptId', UuidPipe) id: string) {
    return this.svc.departmentDetail(ctx, id);
  }

  @Patch(':orgId/departments/:deptId')
  updateDepartment(@Org() ctx: OrgContext, @Param('deptId', UuidPipe) id: string, @Body(zp(updateDepartmentSchema)) body: z.infer<typeof updateDepartmentSchema>) {
    return this.svc.updateDepartment(ctx, id, body);
  }

  @Delete(':orgId/departments/:deptId')
  deleteDepartment(@Org() ctx: OrgContext, @Param('deptId', UuidPipe) id: string) {
    return this.svc.deleteDepartment(ctx, id);
  }

  @Put(':orgId/departments/:deptId/members')
  setMember(@Org() ctx: OrgContext, @Param('deptId', UuidPipe) id: string, @Body(zp(setDepartmentMemberSchema)) body: z.infer<typeof setDepartmentMemberSchema>) {
    return this.svc.setDepartmentMember(ctx, id, body.memberId, body.role);
  }

  @Delete(':orgId/departments/:deptId/members/:memberId')
  removeDeptMember(@Org() ctx: OrgContext, @Param('deptId', UuidPipe) id: string, @Param('memberId', UuidPipe) memberId: string) {
    return this.svc.removeDepartmentMember(ctx, id, memberId);
  }

  @Get(':orgId/office')
  office(@Org() ctx: OrgContext) {
    return this.svc.office(ctx);
  }

  @Put(':orgId/office')
  updateOffice(@Org() ctx: OrgContext, @Body(zp(updateOfficeLayoutSchema)) body: z.infer<typeof updateOfficeLayoutSchema>) {
    return this.svc.updateOffice(ctx, body);
  }

  @Get(':orgId/audit')
  audit(@Org() ctx: OrgContext) {
    return this.svc.auditLog(ctx);
  }
}
