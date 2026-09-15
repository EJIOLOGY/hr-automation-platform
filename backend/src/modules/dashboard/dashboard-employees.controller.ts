import {
  BadRequestException,
  Controller,
  Get,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

import { EmployeeImportParseError } from '../employee/employee-import.parser';
import { EmployeeImportReportService } from '../employee/employee-import-report.service';
import { EmployeeImportService } from '../employee/employee-import.service';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

const FAILED_ROWS_REPORT_DIRECTORY = join(
  process.cwd(),
  'reports',
  'employee-import',
);

const FAILED_ROWS_REPORT_PATTERN =
  /^failed-employee-rows-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.xlsx$/;

@Controller('dashboard/employees')
@UseGuards(JwtAuthGuard)
export class DashboardEmployeesController {
  constructor(
    private readonly employeeImportService: EmployeeImportService,
    private readonly employeeImportReportService: EmployeeImportReportService,
  ) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({
            maxSize: MAX_UPLOAD_BYTES,
          }),
        ],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    try {
      const report = await this.employeeImportService.importFromBuffer(
        file.buffer,
        file.originalname,
        {
          actorType: 'HR_OFFICER',
          actorHrOfficerId: user.id,
        },
      );

      const failedRowsReport =
        this.employeeImportReportService.generateFailedRowsReport(report);

      let failedRowsReportFilename: string | null = null;

      if (failedRowsReport) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        failedRowsReportFilename = `failed-employee-rows-${timestamp}.xlsx`;

        await mkdir(FAILED_ROWS_REPORT_DIRECTORY, {
          recursive: true,
        });

        await writeFile(
          join(FAILED_ROWS_REPORT_DIRECTORY, failedRowsReportFilename),
          failedRowsReport,
        );
      }

      return {
        totalRows: report.totalRows,
        created: report.created,
        updated: report.updated,
        failed: report.failed,
        needsDepartmentReview: report.needsDepartmentReview,
        failedRowsReportFilename,
      };
    } catch (error) {
      if (error instanceof EmployeeImportParseError) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  @Get('import-reports/failed-rows/:filename')
  async downloadFailedRowsReport(
    @Param('filename') filename: string,
    @Res() response: Response,
  ) {
    const safeFilename = basename(filename);

    if (
      safeFilename !== filename ||
      !FAILED_ROWS_REPORT_PATTERN.test(safeFilename)
    ) {
      throw new NotFoundException('Failed rows report not found.');
    }

    const filePath = join(FAILED_ROWS_REPORT_DIRECTORY, safeFilename);

    let fileStats;

    try {
      fileStats = await stat(filePath);

      if (!fileStats.isFile()) {
        throw new NotFoundException('Failed rows report not found.');
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }

      throw new NotFoundException('Failed rows report not found.');
    }

    response.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeFilename}"`,
    );

    response.setHeader('Content-Length', fileStats.size.toString());

    createReadStream(filePath).pipe(response);
  }
}
