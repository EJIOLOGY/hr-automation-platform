import { HttpStatus, Injectable } from '@nestjs/common';
import type { Response } from 'express';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver');
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { payslipError } from '../shared/payslip-error-codes';
import { PAYSLIP_AUDIT_ACTOR, payslipAuditMetadata } from '../shared/payslip-audit';
import { PayslipPdfStatus, PayslipStatus } from '../../../generated/prisma/client';
import { PdfGenerationService } from './pdf-generation.service';

function sanitizeFilenamePart(str: string): string {
  return str.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

export interface PeriodBundleStatusResult {
  included: number;
  ready: number;
  pending: number;
  generating: number;
  failed: number;
  expired: number;
  excludedNotApproved: number;
  earliestExpiry: string | null;
}

@Injectable()
export class PayslipPdfBundleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly pdfGen: PdfGenerationService,
  ) {}

  /**
   * Streams a ZIP bundle for all stored approved PDFs in a batch.
   * If any approved payslip is not READY, returns 409 PDF_NOT_READY.
   */
  async streamBatchBundle(batchId: string, res: Response, actorHrOfficerId: string): Promise<void> {
    const batch = await this.prisma.payslipBatch.findUnique({
      where: { id: batchId },
      include: {
        accountingCompany: true,
        payrollPeriod: true,
        payslips: {
          where: { status: PayslipStatus.APPROVED },
          include: {
            employee: true,
            pdf: { include: { blob: true } },
          },
          orderBy: { staffId: 'asc' },
        },
      },
    });

    if (!batch) {
      throw payslipError(HttpStatus.NOT_FOUND, 'VALIDATION_FAILED', `Batch ${batchId} not found.`);
    }

    const approvedPayslips = batch.payslips;

    let pending = 0;
    let generating = 0;
    let failed = 0;
    let expired = 0;

    for (const p of approvedPayslips) {
      const st = p.pdf?.status;
      if (st === PayslipPdfStatus.READY && p.pdf?.blob) {
        continue;
      } else if (st === PayslipPdfStatus.GENERATING) {
        generating++;
      } else if (st === PayslipPdfStatus.FAILED) {
        failed++;
      } else if (st === PayslipPdfStatus.EXPIRED) {
        expired++;
      } else {
        pending++;
      }
    }

    const notReadyCount = pending + generating + failed + expired;
    if (notReadyCount > 0) {
      throw payslipError(HttpStatus.CONFLICT, 'PDF_NOT_READY', 'Not all approved payslips have ready PDFs.', {
        totalApproved: approvedPayslips.length,
        ready: approvedPayslips.length - notReadyCount,
        pending,
        generating,
        failed,
        expired,
      });
    }

    const companyCode = sanitizeFilenamePart(batch.accountingCompany.code ?? batch.accountingCompany.name);
    const periodName = sanitizeFilenamePart(batch.payrollPeriod.name);
    const archiveName = `${companyCode}_${periodName}_v${batch.version}.zip`;

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${archiveName}"`,
    });

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    for (const p of approvedPayslips) {
      const blobBytes = p.pdf!.blob!.bytes;
      const staffId = sanitizeFilenamePart(p.staffId);
      const empName = sanitizeFilenamePart(p.employee?.fullName ?? 'Employee');
      const filename = `${staffId}_${empName}.pdf`;

      archive.append(Buffer.from(blobBytes), { name: filename });
    }

    await archive.finalize();

    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId,
      action: 'PAYSLIP_PDF_BUNDLE_DOWNLOADED',
      entityType: 'PayslipBatch',
      entityId: batchId,
      metadata: payslipAuditMetadata({
        companyId: batch.accountingCompanyId,
        periodId: batch.payrollPeriodId,
        batchId,
        count: approvedPayslips.length,
      }),
    });
  }

  /**
   * Helper to query current approved payslips across a payroll period.
   * "Current approved" = the latest non-superseded approved version per employee.
   */
  private async getPeriodCurrentApprovedPayslips(periodId: string) {
    // Find all batches for this period
    const batches = await this.prisma.payslipBatch.findMany({
      where: { payrollPeriodId: periodId },
      include: {
        accountingCompany: true,
        payrollPeriod: true,
      },
    });

    if (batches.length === 0) {
      return { batches: [], currentApproved: [], excludedNotApproved: 0 };
    }

    const batchIds = batches.map((b) => b.id);

    // Fetch all payslips across these batches
    const allPayslips = await this.prisma.payslip.findMany({
      where: { payslipBatchId: { in: batchIds } },
      include: {
        employee: true,
        payslipBatch: {
          include: {
            accountingCompany: true,
            payrollPeriod: true,
          },
        },
        pdf: {
          include: { blob: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Determine non-superseded approved payslips per staffId
    // A payslip is superseded if any replacementPayslip exists in a newer batch
    const supersededIds = new Set(
      allPayslips
        .map((p) => p.supersedesPayslipId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    );

    const currentApproved: typeof allPayslips = [];
    let excludedNotApproved = 0;

    // Group by staffId, pick the latest approved one that is not superseded
    const seenStaff = new Set<string>();

    for (const p of allPayslips) {
      if (supersededIds.has(p.id)) {
        continue; // superseded
      }

      if (p.status !== PayslipStatus.APPROVED) {
        excludedNotApproved++;
        continue;
      }

      if (!seenStaff.has(p.staffId)) {
        seenStaff.add(p.staffId);
        currentApproved.push(p);
      }
    }

    return { batches, currentApproved, excludedNotApproved };
  }

  /**
   * Returns readiness status for the whole period bundle.
   */
  async getPeriodBundleStatus(periodId: string): Promise<PeriodBundleStatusResult> {
    const { currentApproved, excludedNotApproved } = await this.getPeriodCurrentApprovedPayslips(periodId);

    let ready = 0;
    let pending = 0;
    let generating = 0;
    let failed = 0;
    let expired = 0;
    let earliestExpiryDate: Date | null = null;

    for (const p of currentApproved) {
      const st = p.pdf?.status;
      if (st === PayslipPdfStatus.READY && p.pdf?.blob) {
        ready++;
        if (p.pdf.expiresAt) {
          if (!earliestExpiryDate || p.pdf.expiresAt < earliestExpiryDate) {
            earliestExpiryDate = p.pdf.expiresAt;
          }
        }
      } else if (st === PayslipPdfStatus.GENERATING) {
        generating++;
      } else if (st === PayslipPdfStatus.FAILED) {
        failed++;
      } else if (st === PayslipPdfStatus.EXPIRED) {
        expired++;
      } else {
        pending++;
      }
    }

    return {
      included: currentApproved.length,
      ready,
      pending,
      generating,
      failed,
      expired,
      excludedNotApproved,
      earliestExpiry: earliestExpiryDate ? earliestExpiryDate.toISOString() : null,
    };
  }

  /**
   * Streams a single ZIP containing the current approved payslips across the entire period.
   */
  async streamPeriodBundle(periodId: string, res: Response, actorHrOfficerId: string): Promise<void> {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
    });

    if (!period) {
      throw payslipError(HttpStatus.NOT_FOUND, 'VALIDATION_FAILED', `Payroll period ${periodId} not found.`);
    }

    const { currentApproved } = await this.getPeriodCurrentApprovedPayslips(periodId);

    let pending = 0;
    let generating = 0;
    let failed = 0;
    let expired = 0;

    for (const p of currentApproved) {
      const st = p.pdf?.status;
      if (st === PayslipPdfStatus.READY && p.pdf?.blob) {
        continue;
      } else if (st === PayslipPdfStatus.GENERATING) {
        generating++;
      } else if (st === PayslipPdfStatus.FAILED) {
        failed++;
      } else if (st === PayslipPdfStatus.EXPIRED) {
        expired++;
      } else {
        pending++;
      }
    }

    const notReadyCount = pending + generating + failed + expired;
    if (notReadyCount > 0) {
      throw payslipError(HttpStatus.CONFLICT, 'PDF_NOT_READY', 'Not all approved payslips in this period have ready PDFs.', {
        included: currentApproved.length,
        ready: currentApproved.length - notReadyCount,
        pending,
        generating,
        failed,
        expired,
      });
    }

    const periodName = sanitizeFilenamePart(period.name);
    const archiveName = `${periodName}_payslips.zip`;

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${archiveName}"`,
    });

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.pipe(res);

    for (const p of currentApproved) {
      const blobBytes = p.pdf!.blob!.bytes;
      const companyCode = sanitizeFilenamePart(p.payslipBatch.accountingCompany.code ?? p.payslipBatch.accountingCompany.name);
      const staffId = sanitizeFilenamePart(p.staffId);
      const empName = sanitizeFilenamePart(p.employee?.fullName ?? 'Employee');
      const filename = `${companyCode}/${staffId}_${empName}.pdf`;

      archive.append(Buffer.from(blobBytes), { name: filename });
    }

    await archive.finalize();

    await this.audit.log({
      actorType: PAYSLIP_AUDIT_ACTOR,
      actorHrOfficerId,
      action: 'PAYSLIP_PERIOD_BUNDLE_DOWNLOADED',
      entityType: 'PayrollPeriod',
      entityId: periodId,
      metadata: payslipAuditMetadata({
        periodId,
        count: currentApproved.length,
      }),
    });
  }
}
