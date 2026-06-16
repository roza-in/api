jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './modules/prisma/prisma.service';
import { QueueService } from './modules/queue/queue.service';
import { ConfigService } from '@nestjs/config';

const mockRedis = {
  ping: jest.fn().mockResolvedValue('PONG'),
  get: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('AppController', () => {
  let controller: AppController;

  const mockAppService = {
    getHello: jest.fn().mockReturnValue('Hello World!'),
  };

  const mockPrismaService = {
    $queryRaw: jest.fn().mockResolvedValue([{ '1': 1 }]),
  };

  const mockQueueService = {
    getQueueHealth: jest.fn().mockResolvedValue([
      {
        name: 'notifications',
        waiting: 0,
        active: 0,
        completed: 10,
        failed: 0,
        delayed: 0,
      },
    ]),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: mockAppService },
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: QueueService, useValue: mockQueueService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
    jest.clearAllMocks();
  });

  describe('getHello', () => {
    it('should return hello message', () => {
      expect(controller.getHello()).toEqual('Hello World!');
    });
  });

  describe('getHealth', () => {
    it('should return healthy status when database and redis are up', async () => {
      mockRedis.get.mockImplementation((key: string) => {
        if (key === 'monitoring:requests:total') return Promise.resolve('100');
        if (key === 'monitoring:requests:errors') return Promise.resolve('5');
        if (key === 'monitoring:latency:sum') return Promise.resolve('5000');
        if (key === 'monitoring:latency:count') return Promise.resolve('100');
        return Promise.resolve(null);
      });

      const health = await controller.getHealth();

      expect(health.status).toBe('healthy');
      expect(health.components.database).toBe('up');
      expect(health.components.redis).toBe('up');
      expect(health.components.queues).toEqual([
        {
          name: 'notifications',
          waiting: 0,
          active: 0,
          completed: 10,
          failed: 0,
          delayed: 0,
        },
      ]);
      expect(health.metrics).toEqual({
        totalRequests: 100,
        totalErrors: 5,
        errorRate: 5.0,
        averageLatencyMs: 50,
      });
    });

    it('should return unhealthy status if database is down', async () => {
      mockPrismaService.$queryRaw.mockRejectedValueOnce(
        new Error('DB connection timeout'),
      );

      const health = await controller.getHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.components.database).toBe('down');
      expect(health.components.redis).toBe('up');
    });

    it('should return unhealthy status if redis is down', async () => {
      mockRedis.ping.mockRejectedValueOnce(
        new Error('Redis connection timeout'),
      );

      const health = await controller.getHealth();

      expect(health.status).toBe('unhealthy');
      expect(health.components.database).toBe('up');
      expect(health.components.redis).toBe('down');
    });
  });
});
