import { Controller, ForbiddenException, Get, Post, Param, Body, Query, Res, UseGuards, NotImplementedException, ParseUUIDPipe } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { HrOfficerRole } from '../../../generated/prisma/client';
import { PdfService } from './pdf.service';
import { PayslipRenderService } from './payslip-render.service';
import { PayslipApprovalService } from '../approval/payslip-approval.service';
import { PayslipAuthorizationService } from '../payslip-authorization.service';
import { ApproveBatchDto } from '../approval/dto/approve-batch.dto';
import { RejectBatchDto } from '../approval/dto/reject-batch.dto';
import { PAYSLIP_AUDIT_ACTOR } from '../shared/payslip-audit';

@Controller('payslip')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
export class PayslipPdfController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly renderService: PayslipRenderService,
    private readonly approvalService: PayslipApprovalService,
    private readonly authorization: PayslipAuthorizationService,
  ) {}

  @Get(':payslipId/pdf')
  async getPayslipPdf(
    @Param('payslipId') payslipId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.authorization.assertPayslip(payslipId, user);
    const data = await this.renderService.getPayslipData(payslipId);
    const pdfBuffer = await this.pdfService.generatePayslipPdf(data);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${data.staffId}-${data.month}-${data.year}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    
    res.end(pdfBuffer);
  }

  @Get(':payslipId/pdf-preview')
  async getPayslipPreview(
    @Param('payslipId') payslipId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.authorization.assertPayslip(payslipId, user);
    const data = await this.renderService.getPayslipData(payslipId, true);
    const pdfBuffer = await this.pdfService.generatePayslipPdf(data);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="preview-${data.staffId}-${data.month}-${data.year}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.end(pdfBuffer);
  }

  @Get('batches/:batchId/pdf-bundle')
  async getBatchPdfBundle(@Param('batchId') batchId: string) {
    throw new NotImplementedException('PDF bundle coming in Phase 4');
  }

  @Post('batches/:batchId/approve')
  async approveBatch(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Body() dto: ApproveBatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertBatch(batchId, user);
    return this.approvalService.approveBatch(batchId, dto, {
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: user.id,
    });
  }

  @Post('batches/:batchId/reject')
  async rejectBatch(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @Body() dto: RejectBatchDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertBatch(batchId, user);
    return this.approvalService.rejectBatch(batchId, dto, {
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: user.id,
    });
  }

  @Get('batches')
  async listBatches(
    @Query('companyId') companyId: string,
    @Query('periodId') periodId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    if (!periodId && user?.role !== HrOfficerRole.ADMIN) {
      throw new ForbiddenException('HR officers must request batches for a claimed payroll period.');
    }
    if (periodId) await this.authorization.assertCompanyPeriod(companyId, periodId, user!);
    return this.approvalService.listBatches(companyId, periodId);
  }
}
