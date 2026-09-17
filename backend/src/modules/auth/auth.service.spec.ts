import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { MailerService } from '../../core/mailer/mailer.service';
import { HrOfficerRole, HrOfficerStatus } from '../../generated/prisma/enums';
import { AuditService } from '../audit/audit.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;

  const prismaMock = {
    hrOfficer: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
  };

  const jwtServiceMock = {
    signAsync: jest.fn(),
    verifyAsync: jest.fn(),
  };

  const configServiceMock = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
      if (key === 'DASHBOARD_URL') return 'https://dashboard.example.com';
      if (key === 'DASHBOARD_ORIGIN') return 'https://dashboard.example.com';
      return undefined;
    }),
  };

  const auditServiceMock = {
    log: jest.fn(),
  };

  const mailerServiceMock = {
    sendPasswordResetEmail: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: JwtService, useValue: jwtServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: AuditService, useValue: auditServiceMock },
        { provide: MailerService, useValue: mailerServiceMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('forgotPassword', () => {
    const genericResponse = {
      message:
        'If an active account exists with that email, a password reset link has been sent.',
    };

    it('generates a token, stores SHA-256 hash and expiry, sends reset email for active officer', async () => {
      const activeOfficer = {
        id: 'officer-uuid-1',
        email: 'officer@example.com',
        fullName: 'Jane Doe',
        status: HrOfficerStatus.ACTIVE,
        role: HrOfficerRole.OFFICER,
      };

      prismaMock.hrOfficer.findUnique.mockResolvedValue(activeOfficer);
      prismaMock.hrOfficer.update.mockResolvedValue(activeOfficer);
      mailerServiceMock.sendPasswordResetEmail.mockResolvedValue(undefined);

      const result = await service.forgotPassword({
        email: '  Officer@Example.COM  ',
      });

      expect(result).toEqual(genericResponse);

      // Email normalization
      expect(prismaMock.hrOfficer.findUnique).toHaveBeenCalledWith({
        where: { email: 'officer@example.com' },
      });

      // Update call contains SHA-256 hash and ~60min expiry
      expect(prismaMock.hrOfficer.update).toHaveBeenCalledTimes(1);
      const updateArgs = prismaMock.hrOfficer.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'officer-uuid-1' });
      expect(typeof updateArgs.data.passwordResetTokenHash).toBe('string');
      expect(updateArgs.data.passwordResetTokenHash).toHaveLength(64); // 32 bytes hex SHA-256
      expect(updateArgs.data.passwordResetTokenExpiresAt).toBeInstanceOf(Date);
      const expiresInMs =
        updateArgs.data.passwordResetTokenExpiresAt.getTime() - Date.now();
      expect(expiresInMs).toBeGreaterThan(59 * 60 * 1000);
      expect(expiresInMs).toBeLessThanOrEqual(60 * 60 * 1000);

      // MailerService called with clean dashboard URL containing the raw token
      expect(mailerServiceMock.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      const [recipient, resetUrl] =
        mailerServiceMock.sendPasswordResetEmail.mock.calls[0];
      expect(recipient).toBe('officer@example.com');
      expect(resetUrl).toContain(
        'https://dashboard.example.com/reset-password?token=',
      );

      // Verify the resetUrl contains raw token whose SHA-256 matches stored hash
      const tokenInUrl = new URL(resetUrl).searchParams.get('token');
      expect(tokenInUrl).toBeTruthy();
      const expectedHash = crypto
        .createHash('sha256')
        .update(tokenInUrl!)
        .digest('hex');
      expect(updateArgs.data.passwordResetTokenHash).toBe(expectedHash);
    });

    it('returns generic response and sends no email when officer is not found', async () => {
      prismaMock.hrOfficer.findUnique.mockResolvedValue(null);

      const result = await service.forgotPassword({
        email: 'unknown@example.com',
      });

      expect(result).toEqual(genericResponse);
      expect(prismaMock.hrOfficer.update).not.toHaveBeenCalled();
      expect(mailerServiceMock.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('returns generic response and sends no email when officer is INACTIVE', async () => {
      const inactiveOfficer = {
        id: 'officer-uuid-2',
        email: 'inactive@example.com',
        status: HrOfficerStatus.INACTIVE,
      };

      prismaMock.hrOfficer.findUnique.mockResolvedValue(inactiveOfficer);

      const result = await service.forgotPassword({
        email: 'inactive@example.com',
      });

      expect(result).toEqual(genericResponse);
      expect(prismaMock.hrOfficer.update).not.toHaveBeenCalled();
      expect(mailerServiceMock.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const rawToken = 'sample-random-token-32-bytes-hex-length';
    const tokenHash = crypto
      .createHash('sha256')
      .update(rawToken)
      .digest('hex');

    it('successfully resets password, clears reset token, invalidates refresh token, and logs audit', async () => {
      const activeOfficer = {
        id: 'officer-uuid-1',
        email: 'officer@example.com',
        status: HrOfficerStatus.ACTIVE,
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      prismaMock.hrOfficer.findFirst.mockResolvedValue(activeOfficer);
      prismaMock.hrOfficer.update.mockResolvedValue({
        ...activeOfficer,
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
        refreshTokenHash: null,
      });

      const result = await service.resetPassword({
        token: rawToken,
        newPassword: 'NewSecurePassword123!',
      });

      expect(result).toEqual({
        message: 'Password has been reset successfully.',
      });

      // Looked up by hash and expiry > now
      expect(prismaMock.hrOfficer.findFirst).toHaveBeenCalledWith({
        where: {
          passwordResetTokenHash: tokenHash,
          passwordResetTokenExpiresAt: {
            gt: expect.any(Date),
          },
          status: HrOfficerStatus.ACTIVE,
        },
      });

      // Updated officer with bcrypt hash, cleared reset fields, cleared refreshTokenHash
      expect(prismaMock.hrOfficer.update).toHaveBeenCalledTimes(1);
      const updateArgs = prismaMock.hrOfficer.update.mock.calls[0][0];
      expect(updateArgs.where).toEqual({ id: 'officer-uuid-1' });
      expect(updateArgs.data.passwordResetTokenHash).toBeNull();
      expect(updateArgs.data.passwordResetTokenExpiresAt).toBeNull();
      expect(updateArgs.data.refreshTokenHash).toBeNull();
      expect(
        await bcrypt.compare(
          'NewSecurePassword123!',
          updateArgs.data.passwordHash,
        ),
      ).toBe(true);

      // Audit log created
      expect(auditServiceMock.log).toHaveBeenCalledWith({
        actorType: 'HR_OFFICER',
        actorHrOfficerId: 'officer-uuid-1',
        action: 'AUTH_PASSWORD_RESET',
        entityType: 'HR_OFFICER',
        entityId: 'officer-uuid-1',
      });
    });

    it('throws BadRequestException if token is invalid or does not match any candidate', async () => {
      prismaMock.hrOfficer.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'invalid-token',
          newPassword: 'NewSecurePassword123!',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prismaMock.hrOfficer.update).not.toHaveBeenCalled();
      expect(auditServiceMock.log).not.toHaveBeenCalled();
    });

    it('throws BadRequestException if token is expired (prisma findFirst returns null)', async () => {
      // Because findFirst checks passwordResetTokenExpiresAt: { gt: now() }, an expired token yields null
      prismaMock.hrOfficer.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 'expired-token',
          newPassword: 'NewSecurePassword123!',
        }),
      ).rejects.toThrow(
        new BadRequestException('Invalid or expired password reset token.'),
      );
    });

    it('ensures single-use behavior because token hash is set to null after reset', async () => {
      const activeOfficer = {
        id: 'officer-uuid-1',
        email: 'officer@example.com',
        status: HrOfficerStatus.ACTIVE,
        passwordResetTokenHash: tokenHash,
        passwordResetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      };

      prismaMock.hrOfficer.findFirst.mockResolvedValueOnce(activeOfficer);
      prismaMock.hrOfficer.update.mockResolvedValueOnce({
        ...activeOfficer,
        passwordResetTokenHash: null,
      });

      // First call succeeds
      await service.resetPassword({
        token: rawToken,
        newPassword: 'NewSecurePassword123!',
      });

      // Second call with same token finds no matching record
      prismaMock.hrOfficer.findFirst.mockResolvedValueOnce(null);

      await expect(
        service.resetPassword({
          token: rawToken,
          newPassword: 'AnotherPassword456!',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
