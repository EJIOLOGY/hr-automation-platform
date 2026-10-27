import {
  Body,
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
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ReviewWorkbookService } from './review-workbook.service';
import { ReviewWorkbookPreviewService } from './review-workbook-preview.service';
import { ReviewDecisionService } from './review-decision.service';
import { ReviewDecisionsDto } from './dto/review-decision.dto';
import { ApplyWorkbookDto } from './dto/apply-workbook.dto';
import { PayslipAuthorizationService } from '../payslip-authorization.service';
import { assertXlsxUpload, xlsxUploadOptions } from '../shared/xlsx-upload';

@Controller('payslip')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
export class ReviewWorkbookController {
  constructor(
    private readonly reviewService: ReviewWorkbookService,
    private readonly previewService: ReviewWorkbookPreviewService,
    private readonly reviewDecisionService: ReviewDecisionService,
    private readonly authorization: PayslipAuthorizationService,
  ) {}

  @Post('batches/:batchId/review-decisions')
  async recordReviewDecisions(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Body() dto: ReviewDecisionsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertBatch(batchId, user);
    return this.reviewDecisionService.recordReviewDecisions(batchId, dto, user);
  }

  @Get('batches/:batchId/review-workbook')
  async exportWorkbook(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ): Promise<void> {
    await this.authorization.assertBatch(batchId, user);
    const buf = await this.reviewService.exportReviewWorkbook(batchId, {
      actorType: 'HR_OFFICER',
      actorHrOfficerId: user.id,
    });
    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="review-${batchId}.xlsx"`,
      'Content-Length': buf.length.toString(),
    });
    res.end(buf);
  }

  /**
   * POST /payslip/batches/:batchId/review-workbook/preview
   *
   * Validates the uploaded workbook against the batch it was exported from, recalculates edited payslips in
   * memory, and returns every problem or the full diff. Creates a 30-minute preview only when it is applicable.
   */
  @Post('batches/:batchId/review-workbook/preview')
  @UseInterceptors(FileInterceptor('file', xlsxUploadOptions))
  async previewWorkbook(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertBatch(batchId, user);
    assertXlsxUpload(file);
    return this.previewService.previewWorkbook(batchId, file.buffer, {
      actorType: 'HR_OFFICER',
      actorHrOfficerId: user.id,
    });
  }

  /**
   * POST /payslip/batches/:batchId/review-workbook/apply
   *
   * Applies a previously created preview in one transaction (edits recalculated and persisted, then decisions).
   * Idempotent: applying the same preview twice returns the first result.
   */
  @Post('batches/:batchId/review-workbook/apply')
  async applyWorkbook(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Body() dto: ApplyWorkbookDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertBatch(batchId, user);
    return this.previewService.applyWorkbook(batchId, dto.previewId, {
      actorType: 'HR_OFFICER',
      actorHrOfficerId: user.id,
    });
  }
}
