import { Module } from '@nestjs/common';
import { BillingRateModule } from './billing-rate/billing-rate.module';

@Module({
  imports: [BillingRateModule],
})
export class PayslipModule {}
