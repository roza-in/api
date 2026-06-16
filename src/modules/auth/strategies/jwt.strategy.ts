import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { UserPayload } from '../../../common/interfaces/user-payload.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  validate(payload: JwtPayload): UserPayload {
    // Only allow access tokens — reject refresh tokens used as access
    if (payload.type !== 'access') {
      throw new Error('Invalid token type');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      businessId: payload.businessId,
      memberId: payload.memberId,
      branchId: payload.branchId,
      roleId: payload.roleId,
    };
  }
}
