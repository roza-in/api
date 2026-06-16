/* eslint-disable @typescript-eslint/unbound-method */
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceProcessor } from './compliance.processor';
import { ComplianceService } from './compliance.service';
import { Job } from 'bullmq';

describe('ComplianceProcessor', () => {
  let processor: ComplianceProcessor;
  let service: ComplianceService;

  const mockComplianceService = {
    executeScheduledDeletions: jest.fn(),
    runRetentionCleanup: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceProcessor,
        { provide: ComplianceService, useValue: mockComplianceService },
      ],
    }).compile();

    processor = module.get<ComplianceProcessor>(ComplianceProcessor);
    service = module.get<ComplianceService>(ComplianceService);

    jest.clearAllMocks();
  });

  describe('process', () => {
    it('should execute scheduled deletions and retention cleanups when job name is compliance-daily-check', async () => {
      mockComplianceService.executeScheduledDeletions.mockResolvedValue({
        processed: 2,
      });
      mockComplianceService.runRetentionCleanup.mockResolvedValue({
        cleanedUp: 1,
      });

      const mockJob = {
        id: 'job-1',
        name: 'compliance-daily-check',
        data: {},
      } as Job;

      await processor.process(mockJob);

      expect(service.executeScheduledDeletions).toHaveBeenCalled();
      expect(service.runRetentionCleanup).toHaveBeenCalled();
    });

    it('should log warning for unknown job names', async () => {
      const mockJob = {
        id: 'job-2',
        name: 'unknown-job',
        data: {},
      } as Job;

      await processor.process(mockJob);

      expect(service.executeScheduledDeletions).not.toHaveBeenCalled();
      expect(service.runRetentionCleanup).not.toHaveBeenCalled();
    });
  });
});
