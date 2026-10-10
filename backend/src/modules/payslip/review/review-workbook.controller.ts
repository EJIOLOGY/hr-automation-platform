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
import { CurrentUser, type AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ReviewWorkbookService } from './review-workbook.service';
import { ReviewWorkbookPreviewService } from './review-workbook-preview.service';
import { ReviewDecisionService } from './review-decision.service';
import { ReviewDecisionsDto } from './dto/review-decision.dto';
import { ApplyWorkbookDto } from './dto/apply-workbook.dto';
import { PayslipAuthorizationService } from '../payslip-authorization.service';

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
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="review-${batchId}.xlsx"`,
      'Content-Length': buf.length.toString(),
    });
    res.end(buf);
  }

  /**
   * POST /payslip/batches/:batchId/review-workbook/preview
   *
   * Parses and validates the uploaded workbook, creates a 10-minute preview,
   * and returns the diff for confirmation before applying.
   */
  @Post('batches/:batchId/review-workbook/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewWorkbook(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertBatch(batchId, user);
    return this.previewService.previewWorkbook(batchId, file.buffer, {
      actorType: 'HR_OFFICER',
      actorHrOfficerId: user.id,
    });
  }

  /**
   * POST /payslip/batches/:batchId/review-workbook/apply
   *
   * Applies a previously created preview.  Validates expiry and batch-state
   * integrity before delegating decisions to ReviewDecisionService.
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

  /** Legacy import endpoint — kept for backwards-compatibility. */
  @Post('batches/:batchId/review-workbook')
  @UseInterceptors(FileInterceptor('file'))
  async importWorkbook(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertBatch(batchId, user);
    return this.reviewService.importReviewWorkbook(batchId, file.buffer, {
      actorType: 'HR_OFFICER',
      actorHrOfficerId: user.id,
    });
  }
}

