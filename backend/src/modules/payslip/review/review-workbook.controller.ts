import {
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { HrOfficerRole } from '../../../generated/prisma/enums';
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ReviewWorkbookService } from './review-workbook.service';

@Controller('payslip')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
export class ReviewWorkbookController {
  constructor(private readonly reviewService: ReviewWorkbookService) {}

  @Get('batches/:batchId/review-workbook')
  async exportWorkbook(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    const buf = await this.reviewService.exportReviewWorkbook(batchId, {
      actorType: 'HR_OFFICER',
      actorHrOfficerId: user.id,
    });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="review-${batchId}.xlsx"`,
      'Content-Length': buf.length.toString(),
    });
    res.end(buf);
  }

  @Post('batches/:batchId/review-workbook')
  @UseInterceptors(FileInterceptor('file'))
  async importWorkbook(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reviewService.importReviewWorkbook(batchId, file.buffer, {
      actorType: 'HR_OFFICER',
      actorHrOfficerId: user.id,
    });
  }
}
