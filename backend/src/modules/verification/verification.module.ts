import { Module } from '@nestjs/common';
import { HrDocumentRequestService } from './hr-document-request.service';
import { VerificationController } from './verification.controller';

@Module({
  providers: [HrDocumentRequestService],
  controllers: [VerificationController],
  exports: [HrDocumentRequestService],
})
export class VerificationModule {}
