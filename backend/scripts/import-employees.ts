import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { EmployeeModule } from '../src/modules/employee/employee.module';
import { EmployeeImportService } from '../src/modules/employee/employee-import.service';
import { EmployeeImportReportService } from '../src/modules/employee/employee-import-report.service';
import { EmployeeImportParseError } from '../src/modules/employee/employee-import.parser';

/**
 * Usage:
 *   pnpm --filter backend import:employees <path-to-spreadsheet.xlsx>
 *
 * Reuses the exact same EmployeeImportService as the dashboard upload
 * endpoint (POST /dashboard/employees/import), so parsing, department
 * derivation, and upsert logic never drift between the two entry
 * points. Exits with a non-zero code if any row failed, so it can be
 * wired into a CI/cron job later without silently swallowing errors.
 */
async function main(): Promise<void> {
  const filePath = process.argv[2];

  if (!filePath) {
    console.error(
      'Usage: pnpm --filter backend import:employees <path-to-spreadsheet.xlsx>',
    );
    process.exitCode = 1;
    return;
  }

  let buffer: Buffer;

  try {
    buffer = await readFile(filePath);
  } catch (error) {
    console.error(
      `Could not read file "${filePath}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
    return;
  }

  const appContext = await NestFactory.createApplicationContext(
    EmployeeModule,
    { logger: ['error', 'warn'] },
  );

  try {
    const importService = appContext.get(EmployeeImportService);
    const reportService = appContext.get(EmployeeImportReportService);

    console.log(`\nImporting employees from ${basename(filePath)}...\n`);

    const report = await importService.importFromBuffer(
      buffer,
      basename(filePath),
      { actorType: 'SYSTEM' },
    );

    console.log(`Total rows:              ${report.totalRows}`);
    console.log(`Created:                 ${report.created}`);
    console.log(`Updated:                 ${report.updated}`);
    console.log(`Failed:                  ${report.failed}`);
    console.log(`Needs department review: ${report.needsDepartmentReview}\n`);

    const errorRows = report.results.filter(
      (result) => result.outcome === 'error',
    );

    if (errorRows.length > 0) {
      console.log('Rows that failed:');

      for (const result of errorRows) {
        console.log(
          `  Row ${result.row}${
            result.employeeNumber ? ` (${result.employeeNumber})` : ''
          }: ${result.error}`,
        );
      }

      console.log('');
    }

    const failedRowsReport = reportService.generateFailedRowsReport(report);

    if (failedRowsReport) {
      const reportsDirectory = join(
        process.cwd(),
        'reports',
        'employee-import',
      );

      await mkdir(reportsDirectory, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      const reportPath = join(
        reportsDirectory,
        `failed-employee-rows-${timestamp}.xlsx`,
      );

      await writeFile(reportPath, failedRowsReport);

      console.log(`Failed rows report: ${reportPath}\n`);
    }

    const reviewRows = report.results.filter(
      (result) => result.departmentNeedsReview,
    );

    if (reviewRows.length > 0) {
      console.log(
        'Rows imported with department = "Unassigned" ' +
          "(designation didn't match any known department — " +
          'review and reclassify in the dashboard):',
      );

      for (const result of reviewRows) {
        console.log(`  Row ${result.row} (${result.employeeNumber})`);
      }

      console.log('');
    }

    if (report.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (error instanceof EmployeeImportParseError) {
      console.error(`\nImport aborted: ${error.message}`);
    } else {
      console.error(
        `\nImport failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    process.exitCode = 1;
  } finally {
    await appContext.close();
  }
}

void main();
