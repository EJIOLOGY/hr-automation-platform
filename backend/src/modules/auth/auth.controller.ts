import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { HrOfficerRole } from '../../generated/prisma/enums';
import { AuthService } from './auth.service';
import { REFRESH_TOKEN_COOKIE } from './auth.constants';
import type { AuthenticatedUser } from './decorators/current-user.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { Roles } from './decorators/roles.decorator';
import { CreateOfficerDto } from './dto/create-officer.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.authService.login(dto);

    this.setRefreshCookie(response, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const refreshToken = request.cookies?.[REFRESH_TOKEN_COOKIE];

    const result = await this.authService.refresh(refreshToken);

    this.setRefreshCookie(response, result.refreshToken);

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthenticatedUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.authService.logout(user.id);

    response.clearCookie(REFRESH_TOKEN_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/v1/auth',
    });

    return {
      message: 'Logged out successfully.',
    };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentUser(user.id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(HrOfficerRole.ADMIN)
  @Post('officers')
  async createOfficer(
    @Body() dto: CreateOfficerDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.authService.createOfficer(dto, user.id);
  }

  private setRefreshCookie(response: Response, refreshToken: string): void {
    response.cookie(
      REFRESH_TOKEN_COOKIE,
      refreshToken,
      this.refreshCookieOptions(),
    );
  }

  private refreshCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/api/v1/auth',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    };
  }
}
