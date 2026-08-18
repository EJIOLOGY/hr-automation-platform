import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import { PhoneNumberNormalizer } from '../../shared/utils/phone-number-normalizer';

@Injectable()
export class EmployeeService {
  constructor(private readonly prisma: PrismaService) {}

  async findByPhoneNumber(phoneNumber: string) {
    const normalizedPhoneNumber = PhoneNumberNormalizer.normalize(phoneNumber);

    const employee = await this.prisma.employee.findUnique({
      where: { phoneNumber: normalizedPhoneNumber },
    });

    if (employee) {
      return employee;
    }

    const localPhoneNumber = `0${normalizedPhoneNumber.slice(4)}`;

    return this.prisma.employee.findUnique({
      where: { phoneNumber: localPhoneNumber },
    });
  }
}
