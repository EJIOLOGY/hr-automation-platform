import { ForbiddenException, HttpException } from '@nestjs/common';
import { ReviewWorkbookController } from './review-workbook.controller';

const BATCH = '11111111-1111-4111-8111-111111111111';
const USER = { id: 'o1', role: 'OFFICER' } as never;

function build(assertBatch: jest.Mock = jest.fn().mockResolvedValue({})) {
  const previewService = {
    previewWorkbook: jest.fn().mockResolvedValue({ previewId: 'p' }),
    applyWorkbook: jest.fn().mockResolvedValue({ applied: true }),
  };
  const controller = new ReviewWorkbookController(
    {} as never,
    previewService as never,
    {} as never,
    { assertBatch } as never,
  );
  return { controller, previewService, assertBatch };
}

describe('ReviewWorkbookController upload safeguards', () => {
  it('returns FILE_REQUIRED (400) for a missing file, never dereferencing buffer', async () => {
    const { controller, previewService } = build();
    await expect(
      controller.previewWorkbook(BATCH, undefined, USER),
    ).rejects.toMatchObject({ status: 400 });
    expect(previewService.previewWorkbook).not.toHaveBeenCalled();
  });

  it('checks the claim BEFORE inspecting the file (no file-shape oracle for non-claimants)', async () => {
    const assertBatch = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('claim first'));
    const { controller, previewService } = build(assertBatch);
    await expect(
      controller.previewWorkbook(BATCH, undefined, USER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(previewService.previewWorkbook).not.toHaveBeenCalled();
  });

  it('rejects a non-ZIP file with INVALID_WORKBOOK_FILE', async () => {
    const { controller } = build();
    const err = await controller
      .previewWorkbook(BATCH, { buffer: Buffer.from('hello') } as never, USER)
      .catch((e: HttpException) => e);
    expect((err as HttpException).getResponse()).toMatchObject({
      code: 'INVALID_WORKBOOK_FILE',
    });
  });

  it('passes a valid workbook buffer to the preview service', async () => {
    const { controller, previewService } = build();
    const buffer = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(4),
    ]);
    await controller.previewWorkbook(BATCH, { buffer } as never, USER);
    expect(previewService.previewWorkbook).toHaveBeenCalledWith(
      BATCH,
      buffer,
      expect.objectContaining({ actorHrOfficerId: 'o1' }),
    );
  });

  it('apply is claim-guarded too', async () => {
    const assertBatch = jest
      .fn()
      .mockRejectedValue(new ForbiddenException('claim first'));
    const { controller, previewService } = build(assertBatch);
    await expect(
      controller.applyWorkbook(BATCH, { previewId: 'p' }, USER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(previewService.applyWorkbook).not.toHaveBeenCalled();
  });
});
