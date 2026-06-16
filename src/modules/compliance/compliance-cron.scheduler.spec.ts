import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceCronScheduler } from './compliance-cron.scheduler';
import { getQueueToken } from '@nestjs/bullmq';
import { QUEUE_COMPLIANCE } from '../queue/queue.constants';

describe('ComplianceCronScheduler', () => {
  let scheduler: ComplianceCronScheduler;

  const mockQueue = {
    add: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceCronScheduler,
        {
          provide: getQueueToken(QUEUE_COMPLIANCE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    scheduler = module.get<ComplianceCronScheduler>(ComplianceCronScheduler);

    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should register daily repeatable job on compliance queue', async () => {
      mockQueue.add.mockResolvedValue({});

      await scheduler.onModuleInit();

      expect(mockQueue.add).toHaveBeenCalledWith(
        'compliance-daily-check',
        {},
        {
          repeat: {
            pattern: '0 0 * * *',
          },
        },
      );
    });
  });
});
