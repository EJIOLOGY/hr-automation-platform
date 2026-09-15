import {
  BadRequestException,
  Controller,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmployeeImportParseError } from '../employee/employee-import.parser';
import { EmployeeImportService } from '../employee/employee-import.service';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

@Controller('dashboard/employees')
@UseGuards(JwtAuthGuard)
export class DashboardEmployeesController {
  constructor(private readonly employeeImportService: EmployeeImportService) {}

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: MAX_UPLOAD_BYTES })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    try {
      return await this.employeeImportService.importFromBuffer(
        file.buffer,
        file.originalname,
        { actorType: 'HR_OFFICER', actorHrOfficerId: user.id },
      );
    } catch (error) {
      if (error instanceof EmployeeImportParseError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
