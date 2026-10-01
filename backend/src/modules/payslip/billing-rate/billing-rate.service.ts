import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { BillingRateUploadStatus } from '../../../generated/prisma/enums';
import { parseBillingRateWorkbook } from './billing-rate.parser';
import { BillingRateValidator } from './billing-rate.validator';

export interface BillingRateImportActor {
  actorType: 'HR_OFFICER';
  actorHrOfficerId: string;
}

@Injectable()
export class BillingRateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly validator: BillingRateValidator,
    private readonly auditService: AuditService,
  ) {}

  async importWorkbook(
    buffer: Buffer,
    fileName: string,
    accountingCompanyId: string,
    payrollPeriodId: string,
    actor: BillingRateImportActor,
  ) {
    const [company, period] = await Promise.all([
      this.prisma.accountingCompany.findUnique({ where: { id: accountingCompanyId } }),
      this.prisma.payrollPeriod.findUnique({ where: { id: payrollPeriodId } }),
    ]);

    if (!company) throw new NotFoundException('Accounting company not found.');
    if (!period) throw new NotFoundException('Payroll period not found.');
    if (period.accountingCompanyId !== accountingCompanyId) {
      throw new ConflictException('Payroll period does not belong to the selected accounting company.');
    }

    const sourceFileHash = createHash('sha256').update(buffer).digest('hex');
    const duplicate = await this.prisma.billingRateUpload.findFirst({
      where: { accountingCompanyId, payrollPeriodId, sourceFileHash },
      select: { id: true, version: true, status: true },
    });

    if (duplicate) {
      throw new ConflictException(
        `This exact Billing Rate file has already been uploaded for this company and payroll period (version ${duplicate.version}, status ${duplicate.status}).`,
      );
    }

    const parsed = parseBillingRateWorkbook(buffer);
    this.validator.validate(parsed);
    const summary = this.validator.summarize(parsed.rows);
    const status = summary.invalidRows > 0 ? BillingRateUploadStatus.REJECTED : BillingRateUploadStatus.VALIDATED;

    const result = await this.prisma.$transaction(async (tx) => {
      const latest = await tx.billingRateUpload.findFirst({
        where: { accountingCompanyId, payrollPeriodId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (latest?.version ?? 0) + 1;

      const upload = await tx.billingRateUpload.create({
        data: {
          accountingCompanyId,
          payrollPeriodId,
          version,
          status,
          fileName,
          sourceFileHash,
          uploadedById: actor.actorHrOfficerId,
          rowCount: summary.totalRows,
          validRowCount: summary.validRows,
          invalidRowCount: summary.invalidRows,
          rows: {
            create: parsed.rows.map((row) => ({
              rowNumber: row.rowNumber,
              staffId: row.staffId || `INVALID_ROW_${row.rowNumber}`,
              rawData: row.rawData,
              normalizedData: row.normalizedData,
              validationErrors: row.validationErrors.length > 0 ? row.validationErrors : undefined,
            })),
          },
        },
        include: { rows: true },
      });

      return upload;
    });

    await this.auditService.log({
      actorType: actor.actorType,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'BILLING_RATE_UPLOADED',
      entityType: 'BILLING_RATE_UPLOAD',
      entityId: result.id,
      metadata: {
        fileName,
        sourceFileHash,
        accountingCompanyId,
        payrollPeriodId,
        version: result.version,
        status,
        totalRows: summary.totalRows,
        validRows: summary.validRows,
        invalidRows: summary.invalidRows,
        unmatchedHeaders: parsed.unmatchedHeaders,
      },
    });

    return {
      id: result.id,
      version: result.version,
      status: result.status,
      fileName: result.fileName,
      sourceFileHash,
      ...summary,
      headerRows: {
        invoice: parsed.invoiceHeaderRow,
        allowance: parsed.allowanceHeaderRow,
      },
      unmatchedHeaders: parsed.unmatchedHeaders,
      rows: parsed.rows.map((row) => ({
        rowNumber: row.rowNumber,
        staffId: row.staffId,
        validationErrors: row.validationErrors,
      })),
    };
  }
}
