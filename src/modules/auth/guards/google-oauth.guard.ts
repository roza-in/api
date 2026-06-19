import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();

    // Passport requires session support to verify state during the callback.
    // Since we are building a stateless API, we only pass state during the
    // initial authorization request. During the callback (when 'code' is present),
    // we omit it here and validate it manually in the controller.
    if (req.query.code) {
      return {};
    }

    return {
      state: req.query.state as string,
    };
  }
}
