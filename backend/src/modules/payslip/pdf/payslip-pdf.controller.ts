import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Param,
  Body,
  Query,
  Res,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { HrOfficerRole, PayslipStatus } from '../../../generated/prisma/client';
import { PdfService } from './pdf.service';
import { PayslipRenderService } from './payslip-render.service';
import { PayslipApprovalService } from '../approval/payslip-approval.service';
import { PayslipAuthorizationService } from '../payslip-authorization.service';
import { ApproveBatchDto } from '../approval/dto/approve-batch.dto';
import { RejectBatchDto } from '../approval/dto/reject-batch.dto';
import { PAYSLIP_AUDIT_ACTOR, payslipAuditMetadata } from '../shared/payslip-audit';
import { AuditService } from '../../audit/audit.service';
import { PdfGenerationService } from './pdf-generation.service';
import { PayslipPdfBundleService } from './payslip-pdf-bundle.service';
import { PrismaService } from '../../../core/prisma/prisma.service';

@Controller('payslip')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(HrOfficerRole.ADMIN, HrOfficerRole.OFFICER)
export class PayslipPdfController {
  constructor(
    private readonly pdfService: PdfService,
    private readonly renderService: PayslipRenderService,
    private readonly approvalService: PayslipApprovalService,
    private readonly authorization: PayslipAuthorizationService,
    private readonly pdfGen: PdfGenerationService,
    private readonly bundleService: PayslipPdfBundleService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * GET /payslip/:payslipId/pdf
   * For APPROVED payslips: serves stored PDF if READY; if not READY, renders once, stores, then serves.
   * For non-approved payslips: renders on demand, does NOT store.
   */
  @Get(':payslipId/pdf')
  async getPayslipPdf(
    @Param('payslipId', new ParseUUIDPipe()) payslipId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.authorization.assertPayslip(payslipId, user);

    const payslip = await this.prisma.payslip.findUnique({
      where: { id: payslipId },
      select: {
        id: true,
        status: true,
        staffId: true,
        payslipBatch: {
          include: {
            payrollPeriod: true,
          },
        },
      },
    });

    if (payslip?.status === PayslipStatus.APPROVED) {
      const readyResult = await this.pdfGen.getReady(payslipId);
      let pdfBuffer: Buffer;

      if (readyResult.status === 'READY') {
        pdfBuffer = readyResult.bytes;
      } else {
        // Lazy render, store, and serve
        pdfBuffer = await this.pdfGen.renderAndStoreSingle(payslipId);
      }

      const periodName = payslip.payslipBatch.payrollPeriod.name ?? 'period';
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="payslip-${payslip.staffId}-${periodName}.pdf"`,
        'Content-Length': pdfBuffer.length.toString(),
      });
      return res.end(pdfBuffer);
    }

    // Non-approved: render on demand, do not store
    const data = await this.renderService.getPayslipData(payslipId);
    const pdfBuffer = await this.pdfService.generatePayslipPdf(data);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="payslip-${data.staffId}-${data.month}-${data.year}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });

    return res.end(pdfBuffer);
  }

  @Get(':payslipId/pdf-preview')
  async getPayslipPreview(
    @Param('payslipId', new ParseUUIDPipe()) payslipId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.authorization.assertPayslip(payslipId, user);
    const data = await this.renderService.getPayslipData(payslipId, true);
    const pdfBuffer = await this.pdfService.generatePayslipPdf(data);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="preview-${data.staffId}-${data.month}-${data.year}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });
    return res.end(pdfBuffer);
  }

  /**
   * GET /payslip/batches/:batchId/pdfs/status
   */
  @Get('batches/:batchId/pdfs/status')
  async getBatchPdfStatus(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertBatch(batchId, user);
    return this.pdfGen.getBatchPdfStatus(batchId);
  }

  /**
   * POST /payslip/batches/:batchId/pdfs/generate
   */
  @Post('batches/:batchId/pdfs/generate')
  async generateBatchPdfs(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const batch = await this.authorization.assertBatch(batchId, user);
    const summary = await this.pdfGen.reenqueueBatch(batchId);

    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId: user.id,
      action: 'PAYSLIP_PDF_GENERATION_REQUESTED',
      entityType: 'PayslipBatch',
      entityId: batchId,
      metadata: payslipAuditMetadata({
        companyId: batch.accountingCompanyId,
        periodId: batch.payrollPeriodId,
        batchId,
      }),
    });

    return summary;
  }

  /**
   * GET /payslip/batches/:batchId/pdf-bundle
   */
  @Get('batches/:batchId/pdf-bundle')
  async getBatchPdfBundle(
    @Param('batchId', new ParseUUIDPipe()) batchId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.authorization.assertBatch(batchId, user);
    await this.bundleService.streamBatchBundle(batchId, res, user.id);
  }

  /**
   * GET /payslip/periods/:periodId/pdf-bundle/status
   */
  @Get('periods/:periodId/pdf-bundle/status')
  async getPeriodBundleStatus(
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.authorization.assertPeriodClaims(periodId, user);
    return this.bundleService.getPeriodBundleStatus(periodId);
  }

  /**
   * GET /payslip/periods/:periodId/pdf-bundle
   */
  @Get('periods/:periodId/pdf-bundle')
  async getPeriodPdfBundle(
    @Param('periodId', new ParseUUIDPipe()) periodId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    await this.authorization.assertPeriodClaims(periodId, user);
    await this.bundleService.streamPeriodBundle(periodId, res, user.id);
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
