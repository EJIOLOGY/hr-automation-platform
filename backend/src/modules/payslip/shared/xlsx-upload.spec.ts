import { HttpException } from '@nestjs/common';
import {
  assertXlsxUpload,
  MAX_XLSX_UPLOAD_BYTES,
  xlsxUploadOptions,
} from './xlsx-upload';

const zipBuffer = (extra = 8) =>
  Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(extra)]);

function codeOf(fn: () => void): { status: number; code: string } {
  try {
    fn();
  } catch (e) {
    const ex = e as HttpException;
    const body = ex.getResponse() as { code: string };
    return { status: ex.getStatus(), code: body.code };
  }
  throw new Error('expected assertXlsxUpload to throw');
}

describe('assertXlsxUpload', () => {
  it('accepts a ZIP-signed buffer', () => {
    expect(() => assertXlsxUpload({ buffer: zipBuffer() })).not.toThrow();
  });

  it.each([undefined, null, {}, { buffer: Buffer.alloc(0) }])(
    'rejects missing/empty upload %p with FILE_REQUIRED',
    (file) => {
      expect(codeOf(() => assertXlsxUpload(file as never))).toEqual({
        status: 400,
        code: 'FILE_REQUIRED',
      });
    },
  );

  it('rejects a non-ZIP file (renamed or legacy .xls) with INVALID_WORKBOOK_FILE', () => {
    expect(
      codeOf(() => assertXlsxUpload({ buffer: Buffer.from('not a workbook') })),
    ).toEqual({
      status: 400,
      code: 'INVALID_WORKBOOK_FILE',
    });
  });

  it('rejects an oversized buffer with 413', () => {
    const big = Buffer.alloc(MAX_XLSX_UPLOAD_BYTES + 1);
    big.set([0x50, 0x4b, 0x03, 0x04]);
    expect(codeOf(() => assertXlsxUpload({ buffer: big })).status).toBe(413);
  });
});

describe('xlsxUploadOptions', () => {
  const run = (originalname: string, mimetype: string) => {
    let result: { err: unknown; accepted: boolean | undefined } = {
      err: undefined,
      accepted: undefined,
    };
    xlsxUploadOptions.fileFilter!(
      {},
      { originalname, mimetype } as never,
      (err, accepted) => {
        result = { err, accepted };
      },
    );
    return result;
  };

  it('limits size and file count', () => {
    expect(xlsxUploadOptions.limits).toEqual({
      fileSize: MAX_XLSX_UPLOAD_BYTES,
      files: 1,
    });
  });

  it('accepts .xlsx and rejects other types', () => {
    expect(run('a.xlsx', 'application/octet-stream').accepted).toBe(true);
    const bad = run('a.csv', 'text/csv');
    expect(bad.accepted).toBe(false);
    expect(bad.err).toBeInstanceOf(Error);
  });
});
