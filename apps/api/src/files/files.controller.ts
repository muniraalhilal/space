import { Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';
import { Org, OrgContext } from '../common/context';
import { UuidPipe, zp } from '../common/zod';
import { FilesService, UploadInput } from './files.service';
import { config } from '../config';

const uploadMeta = z.object({
  departmentId: z.string().uuid().optional(),
  taskId: z.string().uuid().optional(),
  requestId: z.string().uuid().optional(),
  isKnowledge: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

@Controller('orgs/:orgId/files')
export class FilesController {
  constructor(private readonly svc: FilesService) {}

  @Get()
  list(@Org() ctx: OrgContext, @Query('departmentId') departmentId?: string, @Query('knowledge') knowledge?: string) {
    return this.svc.list(ctx, { departmentId: departmentId && /^[0-9a-f-]{36}$/i.test(departmentId) ? departmentId : undefined, knowledge: knowledge === 'true' });
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: config().MAX_UPLOAD_MB * 1024 * 1024, files: 1 } }))
  upload(@Org() ctx: OrgContext, @UploadedFile() file: UploadInput | undefined, @Body(zp(uploadMeta)) meta: z.infer<typeof uploadMeta>) {
    return this.svc.upload(ctx, file, meta);
  }

  @Get(':id/download')
  async download(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string, @Res() res: Response) {
    const { file, stream } = await this.svc.getForDownload(ctx, id);
    res.setHeader('Content-Type', file.mime);
    res.setHeader('Content-Length', String(file.size));
    // Always download (never render inline) and forbid sniffing: uploaded content is untrusted.
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    stream.pipe(res);
  }

  @Delete(':id')
  remove(@Org() ctx: OrgContext, @Param('id', UuidPipe) id: string) {
    return this.svc.remove(ctx, id);
  }
}
