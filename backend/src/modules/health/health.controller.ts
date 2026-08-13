import { Controller, Get, HttpCode } from '@nestjs/common';

@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(200)
  check(): {
    status: string;
    service: string;
    env?: string;
    timestamp: string;
  } {
    return {
      status: 'ok',
      service: 'HR Automation Platform',
      env: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
    };
  }
}
