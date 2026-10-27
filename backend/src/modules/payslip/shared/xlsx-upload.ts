import { BadRequestException, HttpStatus } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { payslipError } from './payslip-error-codes';

export const MAX_XLSX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Multer options shared by every payslip workbook upload: one .xlsx file, at most 10 MB, held in memory.
 * Oversized uploads are rejected by multer itself (HTTP 413) before the file reaches a handler.
 */
export const xlsxUploadOptions: MulterOptions = {
  limits: { fileSize: MAX_XLSX_UPLOAD_BYTES, files: 1 },
  fileFilter: (_request, file, callback) => {
    const accepted =
      file.originalname.toLowerCase().endsWith('.xlsx') ||
      file.mimetype === XLSX_MIME;
    callback(
      accepted
        ? null
        : new BadRequestException('Only .xlsx files are supported.'),
      accepted,
    );
  },
};

/**
 * Handler-side check. Never dereference `file.buffer` without it: a missing `file` field must be a 400,
 * not a 500, and a renamed non-workbook must be refused before a parser sees it.
 * An .xlsx is a ZIP archive, so it must start with the bytes "PK\x03\x04".
 */
export function assertXlsxUpload(
  file: { buffer?: Buffer; size?: number } | undefined | null,
): asserts file is { buffer: Buffer; size?: number } {
  if (!file || !file.buffer || file.buffer.length === 0) {
    throw payslipError(
      HttpStatus.BAD_REQUEST,
      'FILE_REQUIRED',
      'A non-empty .xlsx file is required in the "file" field.',
    );
  }
  if (file.buffer.length > MAX_XLSX_UPLOAD_BYTES) {
    throw payslipError(
      HttpStatus.PAYLOAD_TOO_LARGE,
      'INVALID_WORKBOOK_FILE',
      'The file is larger than 10 MB.',
    );
  }
  const b = file.buffer;
  if (!(b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)) {
    throw payslipError(
      HttpStatus.BAD_REQUEST,
      'INVALID_WORKBOOK_FILE',
      'The file is not a valid .xlsx workbook (it may be renamed, corrupt or an older .xls file).',
    );
  }
}
