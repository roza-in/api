/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
const mockBcryptCompare = jest.fn();
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashedPassword'),
  compare: (raw: string, hash: string) => mockBcryptCompare(raw, hash),
}));
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WhatsAppAdapter } from '../notifications/adapters/whatsapp.adapter';
import { EmailAdapter } from '../notifications/adapters/email.adapter';
import { UnauthorizedException, ConflictException, NotFoundException } from '@nestjs/common';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('AuthService', () => {
  let service: AuthService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    businessMember: {
      findFirst: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-jwt-token'),
    verify: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'REDIS_URL') return 'redis://localhost:6379';
      if (key === 'JWT_EXPIRY') return '15m';
      if (key === 'JWT_REFRESH_EXPIRY') return '7d';
      if (key === 'WHATSAPP_OTP_TEMPLATE_NAME') return 'auth_otp';
      return null;
    }),
  };

  const mockWhatsAppAdapter = {
    sendOtpTemplate: jest.fn().mockResolvedValue('mock-msg-id'),
  };

  const mockEmailAdapter = {
    sendEmail: jest.fn().mockResolvedValue('mock-message-id'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: WhatsAppAdapter, useValue: mockWhatsAppAdapter },
        { provide: EmailAdapter, useValue: mockEmailAdapter },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
    mockBcryptCompare.mockReset();
  });

  describe('sendOtp', () => {
    it('should generate a 6 digit otp, store it in redis and call whatsapp adapter', async () => {
      mockRedis.set.mockResolvedValue('OK');
      const result = await service.sendOtp('+919876543210');

      expect(result).toEqual({ message: 'OTP sent successfully' });
      expect(mockRedis.set).toHaveBeenCalledWith(
        'auth:otp:+919876543210',
        expect.stringMatching(/^\d{6}$/),
        'EX',
        300,
      );
      expect(mockWhatsAppAdapter.sendOtpTemplate).toHaveBeenCalledWith(
        '+919876543210',
        'auth_otp',
        expect.stringMatching(/^\d{6}$/),
      );
    });
  });

  describe('loginWithOtp', () => {
    it('should throw UnauthorizedException if OTP is missing or mismatched', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        service.loginWithOtp('+919876543210', '123456'),
      ).rejects.toThrow(UnauthorizedException);

      mockRedis.get.mockResolvedValue('111111');
      await expect(
        service.loginWithOtp('+919876543210', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should log in existing user if OTP is valid', async () => {
      mockRedis.get.mockResolvedValue('123456');
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-uuid',
        phone: '+919876543210',
        email: 'user@rozx.in',
        status: 'ACTIVE',
      });
      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-uuid',
      });
      mockPrismaService.businessMember.findFirst.mockResolvedValue({
        id: 'member-uuid',
        businessId: 'business-uuid',
        roleId: 'role-uuid',
      });

      const tokens = await service.loginWithOtp('+919876543210', '123456');

      expect(tokens).toEqual({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });
      expect(mockRedis.del).toHaveBeenCalledWith('auth:otp:+919876543210');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid' },
        data: { lastLogin: expect.any(Date) },
      });
    });

    it('should create a new user with fallback email if user does not exist', async () => {
      mockRedis.get.mockResolvedValue('123456');
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'new-user-uuid',
        phone: '+919876543210',
        email: '919876543210@rozx.in',
        status: 'ACTIVE',
      });
      mockPrismaService.businessMember.findFirst.mockResolvedValue(null);

      const tokens = await service.loginWithOtp('+919876543210', '123456');

      expect(tokens).toEqual({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: '+919876543210',
            email: '919876543210@rozx.in',
            status: 'ACTIVE',
          }),
        }),
      );
    });

    it('should append a timestamp to fallback email if standard fallback email already exists', async () => {
      mockRedis.get.mockResolvedValue('123456');
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'some-user' });
      mockPrismaService.user.create.mockResolvedValue({
        id: 'new-user-uuid',
        phone: '+919876543210',
        email: '919876543210_123456@rozx.in',
        status: 'ACTIVE',
      });
      mockPrismaService.businessMember.findFirst.mockResolvedValue(null);

      const tokens = await service.loginWithOtp('+919876543210', '123456');

      expect(tokens).toEqual({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });
      expect(mockPrismaService.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: '+919876543210',
            email: expect.stringMatching(/^919876543210_\d+@rozx\.in$/),
          }),
        }),
      );
    });
  });

  describe('register', () => {
    it('should register a new user successfully if email is unique', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue({
        id: 'user-uuid',
        email: 'test@example.com',
      });

      const result = await service.register({
        name: 'John Doe',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual({
        accessToken: 'mock-jwt-token',
        refreshToken: 'mock-jwt-token',
      });
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: 'test@example.com',
          passwordHash: 'hashedPassword',
          status: 'ACTIVE',
          lastLogin: expect.any(Date),
        },
      });
    });

    it('should throw ConflictException if email is already taken', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'existing-id',
      });

      await expect(
        service.register({
          name: 'John Doe',
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('sendForgotPasswordOtp', () => {
    it('should generate code, store in Redis, and send email successfully', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-uuid',
        email: 'test@example.com',
      });
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.sendForgotPasswordOtp('test@example.com');

      expect(result).toEqual({ message: 'Password reset code sent successfully' });
      expect(mockRedis.set).toHaveBeenCalledWith(
        'auth:reset-password:email:test@example.com',
        expect.stringMatching(/^\d{6}$/),
        'EX',
        600,
      );
      expect(mockEmailAdapter.sendEmail).toHaveBeenCalledWith(
        'test@example.com',
        'Rozx - Password Reset Request',
        expect.stringContaining('Rozx Partner Portal'),
      );
    });

    it('should throw NotFoundException if email is not found', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.sendForgotPasswordOtp('nonexistent@example.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully if code matches', async () => {
      mockRedis.get.mockResolvedValue('123456');
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'user-uuid',
        email: 'test@example.com',
      });
      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-uuid',
      });

      const result = await service.resetPassword('test@example.com', '123456', 'newpass123');

      expect(result).toEqual({ message: 'Password reset successfully' });
      expect(mockRedis.del).toHaveBeenCalledWith('auth:reset-password:email:test@example.com');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid' },
        data: {
          passwordHash: 'hashedPassword',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should throw UnauthorizedException if code is invalid/expired', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        service.resetPassword('test@example.com', '123456', 'newpass123'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw NotFoundException if user does not exist', async () => {
      mockRedis.get.mockResolvedValue('123456');
      mockPrismaService.user.findFirst.mockResolvedValue(null);

      await expect(
        service.resetPassword('test@example.com', '123456', 'newpass123'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-uuid',
        passwordHash: 'oldHashedPassword',
      });
      mockBcryptCompare.mockResolvedValue(true);
      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-uuid',
      });

      const result = await service.changePassword('user-uuid', {
        oldPassword: 'oldpass123',
        newPassword: 'newpass123',
      });

      expect(result).toEqual({ message: 'Password changed successfully' });
      expect(mockBcryptCompare).toHaveBeenCalledWith('oldpass123', 'oldHashedPassword');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid' },
        data: {
          passwordHash: 'hashedPassword',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException if user is not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.changePassword('nonexistent-uuid', {
          oldPassword: 'oldpass123',
          newPassword: 'newpass123',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw UnauthorizedException if old password does not match', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        id: 'user-uuid',
        passwordHash: 'oldHashedPassword',
      });
      mockBcryptCompare.mockResolvedValue(false);

      await expect(
        service.changePassword('user-uuid', {
          oldPassword: 'wrongoldpass',
          newPassword: 'newpass123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('linkPhone', () => {
    it('should link phone number successfully', async () => {
      mockRedis.get.mockResolvedValue('123456');
      mockPrismaService.user.findFirst.mockResolvedValue(null); // No other user has this phone
      mockPrismaService.user.update.mockResolvedValue({
        id: 'user-uuid',
      });

      const result = await service.linkPhone('user-uuid', '+919876543210', '123456');

      expect(result).toEqual({ message: 'Phone number linked successfully' });
      expect(mockRedis.del).toHaveBeenCalledWith('auth:otp:+919876543210');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: 'user-uuid' },
        data: {
          phone: '+919876543210',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should throw UnauthorizedException if OTP is invalid/expired', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        service.linkPhone('user-uuid', '+919876543210', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw ConflictException if phone is already linked to another user', async () => {
      mockRedis.get.mockResolvedValue('123456');
      mockPrismaService.user.findFirst.mockResolvedValue({
        id: 'another-user-uuid',
        phone: '+919876543210',
      });

      await expect(
        service.linkPhone('user-uuid', '+919876543210', '123456'),
      ).rejects.toThrow(ConflictException);
    });
  });
});

