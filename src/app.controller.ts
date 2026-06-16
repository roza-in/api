import { Controller, Get, Logger, VERSION_NEUTRAL } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './modules/prisma/prisma.service';
import { QueueService, QueueHealthStatus } from './modules/queue/queue.service';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Health')
@Controller({
  version: VERSION_NEUTRAL,
})
export class AppController {
  private readonly logger = new Logger(AppController.name);
  private readonly redis: Redis | null = null;

  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
    private readonly configService: ConfigService,
  ) {
    try {
      const redisUrl = this.configService.get<string>('REDIS_URL');
      if (redisUrl) {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: null,
        });
      }
    } catch (err) {
      this.logger.error('Failed to initialize Redis in AppController', err);
    }
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: 'Get system health check and component statuses' })
  @ApiResponse({ status: 200, description: 'System health status' })
  async getHealth() {
    let dbStatus = 'down';
    let redisStatus = 'down';

    // 1. Check DB connection
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      dbStatus = 'up';
    } catch (err) {
      this.logger.error('Database health check failed', err);
    }

    // 2. Check Redis connection
    try {
      if (this.redis) {
        const ping = await this.redis.ping();
        if (ping === 'PONG') {
          redisStatus = 'up';
        }
      }
    } catch (err) {
      this.logger.error('Redis health check failed', err);
    }

    // 3. Check Queue Health
    let queuesHealth: QueueHealthStatus[] = [];
    try {
      queuesHealth = await this.queueService.getQueueHealth();
    } catch (err) {
      this.logger.error('Queues health check failed', err);
    }

    // 4. Retrieve metrics
    let totalRequests = 0;
    let totalErrors = 0;
    let avgLatencyMs = 0;

    try {
      if (this.redis) {
        const [requests, errors, latencySum, latencyCount] = await Promise.all([
          this.redis.get('monitoring:requests:total'),
          this.redis.get('monitoring:requests:errors'),
          this.redis.get('monitoring:latency:sum'),
          this.redis.get('monitoring:latency:count'),
        ]);

        totalRequests = requests ? parseInt(requests, 10) : 0;
        totalErrors = errors ? parseInt(errors, 10) : 0;
        const sum = latencySum ? parseInt(latencySum, 10) : 0;
        const count = latencyCount ? parseInt(latencyCount, 10) : 0;

        avgLatencyMs = count > 0 ? Math.round(sum / count) : 0;
      }
    } catch (err) {
      this.logger.error('Failed to retrieve monitoring metrics', err);
    }

    const errorRate =
      totalRequests > 0
        ? parseFloat(((totalErrors / totalRequests) * 100).toFixed(2))
        : 0.0;

    const isHealthy = dbStatus === 'up' && redisStatus === 'up';

    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      components: {
        database: dbStatus,
        redis: redisStatus,
        queues: queuesHealth,
      },
      metrics: {
        totalRequests,
        totalErrors,
        errorRate,
        averageLatencyMs: avgLatencyMs,
      },
    };
  }
}
