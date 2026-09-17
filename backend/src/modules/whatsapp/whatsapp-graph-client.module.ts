import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

import { WhatsappGraphClient } from './whatsapp-graph-client.service';

@Module({
  imports: [HttpModule],
  providers: [WhatsappGraphClient],
  exports: [WhatsappGraphClient],
})
export class WhatsappGraphClientModule {}
