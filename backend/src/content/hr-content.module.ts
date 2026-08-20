import { Module } from '@nestjs/common';
import { HrContentService } from './hr-content.service';

@Module({
  providers: [HrContentService],
  exports: [HrContentService],
})
export class HrContentModule {}
