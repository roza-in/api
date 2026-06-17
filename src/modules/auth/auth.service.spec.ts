/* eslint-disable @typescript-eslint/no-unsafe-assignment */
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashedPassword'),
  compare: jest.fn(),
}));
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WhatsAppAdapter } from '../notifications/adapters/whatsapp.adapter';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: WhatsAppAdapter, useValue: mockWhatsAppAdapter },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
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
      mockPrismaService.user.findUnique.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.register({
          name: 'John Doe',
          email: 'test@example.com',
          password: 'password123',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
