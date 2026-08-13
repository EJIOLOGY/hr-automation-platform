import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';

@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  async findByPhoneNumber(phoneNumber: string) {
    return this.prisma.employee.findUnique({
      where: { phoneNumber },
    });
  }
}
