import {
  Injectable,
  UnauthorizedException,
  ConflictException,
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
        memberships: {
          where: { deletedAt: null },
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
}
