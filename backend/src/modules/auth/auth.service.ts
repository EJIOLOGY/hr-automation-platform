import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../core/prisma/prisma.service';
import { HrOfficerRole, HrOfficerStatus } from '../../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import {
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
} from './auth.constants';
import { CreateOfficerDto } from './dto/create-officer.dto';
import { LoginDto } from './dto/login.dto';

interface AuthTokenPayload {
  sub: string;
  email: string;
  role: HrOfficerRole;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const officer = await this.prisma.hrOfficer.findUnique({
      where: { email },
    });

    if (
      !officer ||
      officer.status !== HrOfficerStatus.ACTIVE ||
      !(await bcrypt.compare(dto.password, officer.passwordHash))
    ) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const tokens = await this.issueTokens(
      officer.id,
      officer.email,
      officer.role,
    );

    await this.auditService.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: officer.id,
      action: 'AUTH_LOGIN',
      entityType: 'HR_OFFICER',
      entityId: officer.id,
    });

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.publicOfficer(officer),
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required.');
    }

    let payload: AuthTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<AuthTokenPayload>(
        refreshToken,
        {
          secret: this.getRefreshSecret(),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    const officer = await this.prisma.hrOfficer.findUnique({
      where: {
        id: payload.sub,
      },
    });

    if (
      !officer ||
      officer.status !== HrOfficerStatus.ACTIVE ||
      !officer.refreshTokenHash
    ) {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    const validToken = await bcrypt.compare(
      refreshToken,
      officer.refreshTokenHash,
    );

    if (!validToken) {
      throw new UnauthorizedException('Refresh token is no longer valid.');
    }

    const tokens = await this.issueTokens(
      officer.id,
      officer.email,
      officer.role,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.publicOfficer(officer),
    };
  }

  async logout(officerId: string) {
    const officer = await this.prisma.hrOfficer.findUnique({
      where: { id: officerId },
      select: { id: true },
    });

    if (officer) {
      await this.prisma.hrOfficer.update({
        where: { id: officerId },
        data: {
          refreshTokenHash: null,
        },
      });

      await this.auditService.log({
        actorType: 'HR_OFFICER',
        actorHrOfficerId: officerId,
        action: 'AUTH_LOGOUT',
        entityType: 'HR_OFFICER',
        entityId: officerId,
      });
    }
  }

  async getCurrentUser(officerId: string) {
    const officer = await this.prisma.hrOfficer.findUnique({
      where: {
        id: officerId,
      },
    });

    if (!officer || officer.status !== HrOfficerStatus.ACTIVE) {
      throw new UnauthorizedException('HR account is unavailable.');
    }

    return this.publicOfficer(officer);
  }

  async createOfficer(dto: CreateOfficerDto, createdByOfficerId: string) {
    const email = dto.email.trim().toLowerCase();

    const existing = await this.prisma.hrOfficer.findUnique({
      where: { email },
    });

    if (existing) {
      throw new ConflictException(
        'An HR account with this email already exists.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const officer = await this.prisma.hrOfficer.create({
      data: {
        fullName: dto.fullName.trim(),
        email,
        passwordHash,
        role: dto.role,
        status: HrOfficerStatus.ACTIVE,
      },
    });

    await this.auditService.log({
      actorType: 'HR_OFFICER',
      actorHrOfficerId: createdByOfficerId,
      action: 'HR_OFFICER_CREATED',
      entityType: 'HR_OFFICER',
      entityId: officer.id,
      metadata: {
        role: officer.role,
      },
    });

    return this.publicOfficer(officer);
  }

  private async issueTokens(
    officerId: string,
    email: string,
    role: HrOfficerRole,
  ) {
    const payload: AuthTokenPayload = {
      sub: officerId,
      email,
      role,
    };

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.getAccessSecret(),
      expiresIn: ACCESS_TOKEN_EXPIRES_IN,
    });

    const refreshToken = await this.jwtService.signAsync(payload, {
      secret: this.getRefreshSecret(),
      expiresIn: REFRESH_TOKEN_EXPIRES_IN,
    });

    const refreshTokenHash = await bcrypt.hash(refreshToken, 12);

    await this.prisma.hrOfficer.update({
      where: {
        id: officerId,
      },
      data: {
        refreshTokenHash,
      },
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  private getAccessSecret(): string {
    const secret = this.configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured.');
    }

    return secret;
  }

  private getRefreshSecret(): string {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');

    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not configured.');
    }

    return secret;
  }

  private publicOfficer(officer: {
    id: string;
    fullName: string;
    email: string;
    role: HrOfficerRole;
    status: HrOfficerStatus;
  }) {
    return {
      id: officer.id,
      fullName: officer.fullName,
      email: officer.email,
      role: officer.role,
      status: officer.status,
    };
  }
}
