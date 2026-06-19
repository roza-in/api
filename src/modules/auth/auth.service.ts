import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleProfile } from './strategies/google.strategy';
import { WhatsAppAdapter } from '../notifications/adapters/whatsapp.adapter';
import { EmailAdapter } from '../notifications/adapters/email.adapter';
import { ChangePasswordDto } from './dto/change-password.dto';

const BCRYPT_ROUNDS = 10;
const REFRESH_TOKEN_PREFIX = 'auth:refresh:blacklist:';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly whatsappAdapter: WhatsAppAdapter,
    private readonly emailAdapter: EmailAdapter,
  ) {
    const redisUrl =
      this.configService.get<string>('REDIS_URL') || 'redis://localhost:6379';
    this.redis = new Redis(redisUrl);
  }

  async register(dto: RegisterDto): Promise<TokenPair> {
    // Check if user already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        status: 'ACTIVE',
        lastLogin: new Date(),
      },
    });

    this.logger.log(`New user registered: ${user.email}`);

    return this.generateTokenPair(user.id, user.email);
  }

  async login(dto: LoginDto): Promise<TokenPair> {
    // Find user by email
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Account is suspended or pending');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Update lastLogin
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Find first business membership for JWT context
    const membership = await this.prisma.businessMember.findFirst({
      where: { userId: user.id, deletedAt: null },
      include: { business: true },
    });

    return this.generateTokenPair(
      user.id,
      user.email,
      membership?.businessId,
      membership?.id,
      membership?.roleId,
    );
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Must be a refresh token
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    // Check if token is blacklisted
    const isBlacklisted = await this.redis.get(
      `${REFRESH_TOKEN_PREFIX}${payload.jti}`,
    );
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Blacklist the used refresh token (rotation — old token cannot be reused)
    const ttl = payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : 0;
    if (ttl > 0) {
      await this.redis.set(
        `${REFRESH_TOKEN_PREFIX}${payload.jti}`,
        '1',
        'EX',
        ttl,
      );
    }

    // Generate new token pair
    return this.generateTokenPair(
      payload.sub,
      payload.email,
      payload.businessId,
      payload.memberId,
      payload.roleId,
    );
  }

  async logout(refreshToken: string): Promise<void> {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(refreshToken);
    } catch {
      // Token already expired or invalid — consider logged out
      return;
    }

    // Blacklist the refresh token
    const ttl = payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : 0;
    if (ttl > 0) {
      await this.redis.set(
        `${REFRESH_TOKEN_PREFIX}${payload.jti}`,
        '1',
        'EX',
        ttl,
      );
    }

    this.logger.log(`User ${payload.sub} logged out`);
  }

  async validateGoogleUser(profile: GoogleProfile): Promise<TokenPair> {
    // Find or create user by email
    let user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (!user) {
      // Create new user from Google profile (no password needed)
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          passwordHash: '', // No password for OAuth users
          oauthProvider: 'google',
          oauthId: profile.googleId,
          status: 'ACTIVE',
          lastLogin: new Date(),
        },
      });

      this.logger.log(`New Google user created: ${user.email}`);
    } else {
      // Link Google account if not already linked
      if (!user.oauthProvider) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            oauthProvider: 'google',
            oauthId: profile.googleId,
            lastLogin: new Date(),
          },
        });
      } else {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lastLogin: new Date() },
        });
      }
    }

    // Find first business membership for JWT context
    const membership = await this.prisma.businessMember.findFirst({
      where: { userId: user.id, deletedAt: null },
      include: { business: true },
    });

    return this.generateTokenPair(
      user.id,
      user.email,
      membership?.businessId,
      membership?.id,
      membership?.roleId,
    );
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        oauthProvider: true,
        status: true,
        lastLogin: true,
        createdAt: true,
        membership: {
          select: {
            id: true,
            businessId: true,
            roleId: true,
            business: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
              },
            },
            role: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    return user;
  }

  generateTokenPair(
    userId: string,
    email: string,
    businessId?: string,
    memberId?: string,
    roleId?: string,
  ): TokenPair {
    const accessJti = uuidv4();
    const refreshJti = uuidv4();

    const accessPayload: JwtPayload = {
      sub: userId,
      email,
      businessId,
      memberId,
      roleId,
      jti: accessJti,
      type: 'access',
    };

    const refreshPayload: JwtPayload = {
      sub: userId,
      email,
      businessId,
      memberId,
      roleId,
      jti: refreshJti,
      type: 'refresh',
    };

    const accessToken = this.jwtService.sign(accessPayload, {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expiresIn: (this.configService.get<string>('JWT_EXPIRY') || '15m') as any,
    });

    const refreshToken = this.jwtService.sign(refreshPayload, {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      expiresIn: (this.configService.get<string>('JWT_REFRESH_EXPIRY') ||
        '7d') as any,
    });

    return { accessToken, refreshToken };
  }

  async sendOtp(phone: string): Promise<{ message: string }> {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const redisKey = `auth:otp:${phone}`;

    await this.redis.set(redisKey, code, 'EX', 300);

    const templateName =
      this.configService.get<string>('WHATSAPP_OTP_TEMPLATE_NAME') ||
      'auth_otp';

    this.logger.log(`Dispatching WhatsApp OTP to ${phone}`);
    await this.whatsappAdapter.sendOtpTemplate(phone, templateName, code);

    return { message: 'OTP sent successfully' };
  }

  async loginWithOtp(phone: string, code: string): Promise<TokenPair> {
    const redisKey = `auth:otp:${phone}`;
    const cachedCode = await this.redis.get(redisKey);

    if (!cachedCode || cachedCode !== code) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.redis.del(redisKey);

    let user = await this.prisma.user.findFirst({
      where: { phone, deletedAt: null },
    });

    if (!user) {
      const fallbackEmail = `${phone.replace(/\D/g, '')}@rozx.in`;
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: fallbackEmail },
      });
      const email = existingEmail
        ? `${phone.replace(/\D/g, '')}_${Date.now()}@rozx.in`
        : fallbackEmail;

      user = await this.prisma.user.create({
        data: {
          phone,
          email,
          passwordHash: '',
          status: 'ACTIVE',
          lastLogin: new Date(),
        },
      });
      this.logger.log(`New user created via WhatsApp OTP login: ${user.phone}`);
    } else {
      if (user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Account is suspended or pending');
      }

      await this.prisma.user.update({
        where: { id: user.id },
        data: { lastLogin: new Date() },
      });
    }

    const membership = await this.prisma.businessMember.findFirst({
      where: { userId: user.id, deletedAt: null },
      include: { business: true },
    });

    return this.generateTokenPair(
      user.id,
      user.email,
      membership?.businessId,
      membership?.id,
      membership?.roleId,
    );
  }

  async sendForgotPasswordOtp(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User with this email not found');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const redisKey = `auth:reset-password:email:${email}`;

    await this.redis.set(redisKey, code, 'EX', 600); // 10 minutes expiry

    const subject = 'Rozx - Password Reset Request';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px;">
        <h2 style="color: #10b981; text-align: center;">Rozx Partner Portal</h2>
        <p>Hello,</p>
        <p>We received a request to reset the password for your Rozx account. Use the verification code below to complete the reset process. This code is valid for 10 minutes.</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-family: monospace; font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #111827; background: #f3f4f6; padding: 10px 20px; border-radius: 8px; border: 1px solid #d1d5db;">
            ${code}
          </span>
        </div>
        <p>If you did not request a password reset, please ignore this email or contact support if you have concerns.</p>
        <p style="color: #6b7280; font-size: 12px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
          This is an automated email. Please do not reply to this message.<br>
          © 2026 Rozx Technologies. All rights reserved.
        </p>
      </div>
    `;

    this.logger.log(`Dispatching email OTP to ${email}`);
    await this.emailAdapter.sendEmail(email, subject, html);

    return { message: 'Password reset code sent successfully' };
  }

  async resetPassword(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const redisKey = `auth:reset-password:email:${email}`;
    const cachedCode = await this.redis.get(redisKey);

    if (!cachedCode || cachedCode !== code) {
      throw new UnauthorizedException('Invalid or expired reset code');
    }

    await this.redis.del(redisKey);

    const user = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundException('User with this email not found');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Password reset successfully for user: ${email}`);

    return { message: 'Password reset successfully' };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.passwordHash) {
      const isPasswordValid = await bcrypt.compare(
        dto.oldPassword,
        user.passwordHash,
      );

      if (!isPasswordValid) {
        throw new UnauthorizedException('Incorrect old password');
      }
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        updatedAt: new Date(),
      },
    });

    this.logger.log(`Password changed successfully for user ID: ${userId}`);

    return { message: 'Password changed successfully' };
  }

  async linkPhone(
    userId: string,
    phone: string,
    code: string,
  ): Promise<{ message: string }> {
    const redisKey = `auth:otp:${phone}`;
    const cachedCode = await this.redis.get(redisKey);

    if (!cachedCode || cachedCode !== code) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const existingUserWithPhone = await this.prisma.user.findFirst({
      where: {
        phone,
        id: { not: userId },
        deletedAt: null,
      },
    });

    if (existingUserWithPhone) {
      throw new ConflictException(
        'This phone number is already linked to another account',
      );
    }

    await this.redis.del(redisKey);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        phone,
        updatedAt: new Date(),
      },
    });

    this.logger.log(
      `Phone number ${phone} successfully linked to user ID ${userId}`,
    );

    return { message: 'Phone number linked successfully' };
  }
}
