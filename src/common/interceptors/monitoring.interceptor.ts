import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import type { Request } from 'express';

@Injectable()
export class MonitoringInterceptor implements NestInterceptor {
  private readonly redis: Redis | null = null;

  constructor(private readonly configService: ConfigService) {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL');
      if (redisUrl) {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: null,
        });
      }
    } catch {
      // Resilient: fail silently at runtime to avoid breaking the application
    }
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const startTime = Date.now();
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<Request>();

    // Skip monitoring for health check and status endpoints
    const isHealthPath =
      request.url?.includes('/health') ||
      request.url?.includes('/admin/status');

    return next.handle().pipe(
      tap({
        next: () => {
          if (!isHealthPath && this.redis) {
            const duration = Date.now() - startTime;
            this.recordMetrics(duration, false);
          }
        },
        error: () => {
          if (!isHealthPath && this.redis) {
            const duration = Date.now() - startTime;
            this.recordMetrics(duration, true);
          }
        },
      }),
    );
  }

  private recordMetrics(durationMs: number, isError: boolean) {
    try {
      if (this.redis) {
        void this.redis.incr('monitoring:requests:total');
        if (isError) {
          void this.redis.incr('monitoring:requests:errors');
        }
        void this.redis.incrby('monitoring:latency:sum', durationMs);
        void this.redis.incr('monitoring:latency:count');
      }
    } catch {
      // Fail silently to safeguard HTTP request completion
    }
  }
}
