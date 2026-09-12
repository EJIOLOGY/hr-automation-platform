import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { RealtimeGateway } from './realtime.gateway';

@Module({
  // Registered without a default secret, matching AuthModule's pattern:
  // the gateway passes JWT_ACCESS_SECRET explicitly on each verifyAsync
  // call, the same way AuthService signs/verifies access tokens.
  imports: [JwtModule.register({})],
  providers: [RealtimeGateway],
  exports: [RealtimeGateway],
})
export class RealtimeModule {}
