import { Test, TestingModule } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;

  const authServiceMock = {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    getCurrentUser: jest.fn(),
    createOfficer: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authServiceMock,
        },
      ],
    })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /auth/forgot-password', () => {
    it('delegates to authService.forgotPassword and returns generic message', async () => {
      const expectedResponse = {
        message:
          'If an active account exists with that email, a password reset link has been sent.',
      };
      authServiceMock.forgotPassword.mockResolvedValue(expectedResponse);

      const dto = { email: 'officer@example.com' };
      const result = await controller.forgotPassword(dto);

      expect(authServiceMock.forgotPassword).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResponse);
    });
  });

  describe('POST /auth/reset-password', () => {
    it('delegates to authService.resetPassword and returns success message', async () => {
      const expectedResponse = {
        message: 'Password has been reset successfully.',
      };
      authServiceMock.resetPassword.mockResolvedValue(expectedResponse);

      const dto = {
        token: 'test-token',
        newPassword: 'NewSecurePassword123!',
      };
      const result = await controller.resetPassword(dto);

      expect(authServiceMock.resetPassword).toHaveBeenCalledWith(dto);
      expect(result).toEqual(expectedResponse);
    });
  });
});
