import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PhoneNumberNormalizer } from '../../shared/utils/phone-number-normalizer';
import { AuditService } from '../audit/audit.service';
import { deriveDepartment } from './department-from-designation';
import { isEmailValid, maskEmail, normalizeEmail } from './email-utils';
import {
  EmployeeImportParseError,
  parseEmployeeSpreadsheet,
} from './employee-import.parser';
import type {
  EmployeeImportReport,
  EmployeeUpsertInput,
  ImportRowResult,
} from './employee-import.types';

export interface ImportActor {
  actorType: 'HR_OFFICER' | 'SYSTEM';
  actorHrOfficerId?: string;
}

@Injectable()
export class EmployeeImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async importFromBuffer(
    buffer: Buffer,
    sourceFileName: string,
    actor: ImportActor,
  ): Promise<EmployeeImportReport> {
    let parsed: ReturnType<typeof parseEmployeeSpreadsheet>;

    try {
      parsed = parseEmployeeSpreadsheet(buffer);
    } catch (error) {
      if (error instanceof EmployeeImportParseError) {
        throw error;
      }

      throw error;
    }

    const results: ImportRowResult[] = [];
    const seenEmployeeNumbers = new Set<string>();
    const seenEmails = new Set<string>();

    for (const { row, data } of parsed.rows) {
      const result = await this.importRow(row, data, seenEmployeeNumbers, seenEmails);

      results.push(result);
    }

    const report: EmployeeImportReport = {
      totalRows: results.length,
      created: results.filter((result) => result.outcome === 'created').length,
      updated: results.filter((result) => result.outcome === 'updated').length,
      failed: results.filter((result) => result.outcome === 'error').length,
      needsDepartmentReview: results.filter(
        (result) => result.departmentNeedsReview,
      ).length,
      emailWarnings: results.filter((result) => result.emailWarning !== undefined).length,
      results,
    };

    await this.auditService.log({
      actorType: actor.actorType,
      actorHrOfficerId: actor.actorHrOfficerId,
      action: 'EMPLOYEE_SPREADSHEET_IMPORTED',
      entityType: 'EMPLOYEE',
      metadata: {
        sourceFileName,
        totalRows: report.totalRows,
        created: report.created,
        updated: report.updated,
        failed: report.failed,
        needsDepartmentReview: report.needsDepartmentReview,
      },
    });

    return report;
  }

  private async importRow(
    row: number,
    data: {
      employeeNumber: string | undefined;
      fullName: string | undefined;
      email: string | undefined;
      designation: string | undefined;
      phoneNumber: string | undefined;
    },
    seenEmployeeNumbers: Set<string>,
    seenEmails: Set<string>,
  ): Promise<ImportRowResult> {
    if (!data.employeeNumber) {
      return {
        row,
        outcome: 'error',
        fullName: data.fullName,
        email: data.email,
        designation: data.designation,
        phoneNumber: data.phoneNumber,
        error: 'Missing employee ID.',
      };
    }

    if (seenEmployeeNumbers.has(data.employeeNumber)) {
      return {
        row,
        outcome: 'error',
        employeeNumber: data.employeeNumber,
        fullName: data.fullName,
        email: data.email,
        designation: data.designation,
        phoneNumber: data.phoneNumber,
        error: `Duplicate employee ID (${data.employeeNumber}) in this file.`,
      };
    }

    seenEmployeeNumbers.add(data.employeeNumber);

    if (!data.fullName) {
      return {
        row,
        outcome: 'error',
        employeeNumber: data.employeeNumber,
        email: data.email,
        designation: data.designation,
        phoneNumber: data.phoneNumber,
        error: 'Missing employee name.',
      };
    }

    if (!data.phoneNumber) {
      return {
        row,
        outcome: 'error',
        employeeNumber: data.employeeNumber,
        fullName: data.fullName,
        email: data.email,
        designation: data.designation,
        error:
          'Missing WhatsApp phone number — employee cannot be matched to bot messages without it.',
      };
    }

    let normalizedPhoneNumber: string;

    try {
      normalizedPhoneNumber = PhoneNumberNormalizer.normalize(data.phoneNumber);
    } catch {
      return {
        row,
        outcome: 'error',
        employeeNumber: data.employeeNumber,
        fullName: data.fullName,
        email: data.email,
        designation: data.designation,
        phoneNumber: data.phoneNumber,
        error: `Invalid phone number "${data.phoneNumber}".`,
      };
    }

    // ── Email validation (non-fatal) ─────────────────────────────────────────
    let resolvedEmail: string | undefined;
    let emailWarning: ImportRowResult['emailWarning'];

    if (data.email) {
      const normalized = normalizeEmail(data.email);

      if (seenEmails.has(normalized)) {
        emailWarning = 'DUPLICATE_EMAIL';
        // Do NOT add to set — we already have it; just warn and skip persisting.
      } else {
        const valid = await isEmailValid(normalized);
        if (!valid) {
          emailWarning = 'INVALID_EMAIL';
        } else {
          resolvedEmail = normalized;
          seenEmails.add(normalized);
        }
      }
    }

    const { department, matched } = deriveDepartment(data.designation);

    const upsertInput: EmployeeUpsertInput = {
      employeeNumber: data.employeeNumber,
      fullName: data.fullName,
      phoneNumber: normalizedPhoneNumber,
      department,
      jobTitle: data.designation ?? 'Unspecified',
      status: 'ACTIVE',
      ...(resolvedEmail !== undefined
        ? { email: resolvedEmail, emailUpdatedAt: new Date() }
        : {}),
    };

    try {
      const existing = await this.prisma.employee.findUnique({
        where: {
          employeeNumber: upsertInput.employeeNumber,
        },
        select: {
          id: true,
          email: true,
        },
      });

      // Only stamp emailUpdatedAt when the email value actually changes
      const emailChanged =
        resolvedEmail !== undefined && existing?.email !== resolvedEmail;

      await this.prisma.employee.upsert({
        where: {
          employeeNumber: upsertInput.employeeNumber,
        },
        create: upsertInput,
        update: {
          fullName: upsertInput.fullName,
          phoneNumber: upsertInput.phoneNumber,
          department: upsertInput.department,
          jobTitle: upsertInput.jobTitle,
          ...(resolvedEmail !== undefined
            ? {
                email: resolvedEmail,
                ...(emailChanged ? { emailUpdatedAt: new Date() } : {}),
              }
            : {}),
        },
      });

      return {
        row,
        outcome: existing ? 'updated' : 'created',
        employeeNumber: upsertInput.employeeNumber,
        departmentNeedsReview: !matched,
        ...(emailWarning !== undefined ? { emailWarning } : {}),
        ...(resolvedEmail !== undefined
          ? { email: maskEmail(resolvedEmail) }
          : {}),
      };
    } catch (error) {
      return {
        row,
        outcome: 'error',
        employeeNumber: data.employeeNumber,
        fullName: data.fullName,
        email: data.email,
        designation: data.designation,
        phoneNumber: data.phoneNumber,
        error: this.describePrismaError(error, normalizedPhoneNumber),
      };
    }
  }

  private describePrismaError(error: unknown, phoneNumber: string): string {
    const message = error instanceof Error ? error.message : String(error);

    if (message.includes('phoneNumber')) {
      return `Phone number ${phoneNumber} is already assigned to a different employee.`;
    }

    return `Could not save this row: ${message}`;
  }
}
