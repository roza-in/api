/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call */
jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
import { Test, TestingModule } from '@nestjs/testing';
import { ExportsService } from './exports.service';
import { ReportsProcessor } from './reports.processor';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { QUEUE_REPORTS } from '../queue/queue.constants';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('ExportsService & ReportsProcessor', () => {
  let service: ExportsService;
  let processor: ReportsProcessor;

  const appointmentFindMany = jest.fn();
  const paymentFindMany = jest.fn();
  const customerFindMany = jest.fn();
  const auditLogCreate = jest.fn();

  const mockPrisma = {
    appointment: {
      findMany: appointmentFindMany,
    },
    payment: {
      findMany: paymentFindMany,
    },
    customer: {
      findMany: customerFindMany,
    },
    auditLog: {
      create: auditLogCreate,
    },
  };

  const mockStorageService = {
    uploadFile: jest
      .fn()
      .mockResolvedValue('https://cdn.rozx.in/mock-report-url.csv'),
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  const mockReportsQueue = {
    add: jest.fn().mockResolvedValue({ id: 'job-1' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportsService,
        ReportsProcessor,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getQueueToken(QUEUE_REPORTS), useValue: mockReportsQueue },
      ],
    }).compile();

    service = module.get<ExportsService>(ExportsService);
    processor = module.get<ReportsProcessor>(ReportsProcessor);
    jest.clearAllMocks();
  });

  const businessId = 'business-uuid';
  const userId = 'user-uuid';

  describe('parseReportDates', () => {
    it('should default to last 30 days if no dates are provided', () => {
      const { start, end } = service.parseReportDates();
      expect(start).toBeInstanceOf(Date);
      expect(end).toBeInstanceOf(Date);
      expect(start.getHours()).toEqual(0);
      expect(end.getHours()).toEqual(23);
    });

    it('should parse valid dates and set boundaries', () => {
      const { start, end } = service.parseReportDates(
        '2026-06-01',
        '2026-06-15',
      );
      expect(start.getDate()).toEqual(1);
      expect(end.getDate()).toEqual(15);
      expect(start.getHours()).toEqual(0);
      expect(end.getHours()).toEqual(23);
    });

    it('should throw BadRequestException if start date is after end date', () => {
      expect(() =>
        service.parseReportDates('2026-06-15', '2026-06-01'),
      ).toThrow(BadRequestException);
    });
  });

  describe('CSV Generation formatting', () => {
    it('should escape double quotes and format columns properly', () => {
      const title = 'Test Title';
      const headers = ['Col 1', 'Col "Quote" 2'];
      const rows = [
        ['Val, 1', 'Val 2'],
        ['Val "Quote" 3', 'Val 4'],
      ];
      const metadata = { 'Gen At': '15-06-2026' };

      const buffer = (service as any).generateCsv(
        title,
        headers,
        rows,
        metadata,
      );
      const csvStr = buffer.toString('utf-8');

      expect(csvStr).toContain('"Report Title","Test Title"');
      expect(csvStr).toContain('"Gen At","15-06-2026"');
      expect(csvStr).toContain('"Col 1","Col ""Quote"" 2"');
      expect(csvStr).toContain('"Val, 1","Val 2"');
      expect(csvStr).toContain('"Val ""Quote"" 3","Val 4"');
    });
  });

  describe('exportReport (Sync)', () => {
    it('should export appointments report successfully', async () => {
      appointmentFindMany.mockResolvedValue([
        {
          startTime: new Date('2026-06-15T10:00:00Z'),
          customer: { name: 'Customer 1', phone: '9876543210' },
          staff: { name: 'Staff 1' },
          service: { name: 'Service 1', price: 150000 }, // 1500 Rs
          status: 'CONFIRMED',
        },
      ]);
      auditLogCreate.mockResolvedValue({ id: 'audit-1' });

      const url = await service.exportReport(
        businessId,
        userId,
        'appointments',
        '2026-06-01',
        '2026-06-15',
        'csv',
      );

      expect(url).toEqual('https://cdn.rozx.in/mock-report-url.csv');
      expect(appointmentFindMany).toHaveBeenCalled();
      expect(auditLogCreate).toHaveBeenCalledWith({
        data: {
          businessId,
          userId,
          action: 'EXPORT',
          entity: 'Report',
          entityId: expect.any(String),
          metadata: expect.objectContaining({
            reportType: 'appointments',
            format: 'csv',
            fileUrl: 'https://cdn.rozx.in/mock-report-url.csv',
          }),
        },
      });
    });

    it('should export revenue report successfully', async () => {
      paymentFindMany.mockResolvedValue([
        {
          amount: 50000, // 500 Rs
          providerPaymentId: 'pay_123',
          status: 'SUCCESS',
          createdAt: new Date('2026-06-15T12:00:00Z'),
          appointment: {
            customer: { name: 'Customer 2' },
            service: { name: 'Service 2' },
            invoices: [{ invoiceNumber: 'INV-2026-0001' }],
          },
          refunds: [{ status: 'processed', amount: 10000 }], // 100 Rs
        },
      ]);
      auditLogCreate.mockResolvedValue({ id: 'audit-2' });

      const url = await service.exportReport(
        businessId,
        userId,
        'revenue',
        '2026-06-01',
        '2026-06-15',
        'csv',
      );

      expect(url).toEqual('https://cdn.rozx.in/mock-report-url.csv');
      expect(paymentFindMany).toHaveBeenCalled();
    });

    it('should export customers report successfully', async () => {
      customerFindMany.mockResolvedValue([
        {
          name: 'Customer 3',
          phone: '9999999999',
          email: 'cust3@example.com',
          totalSpent: 100000, // 1000 Rs
          appointments: [{ startTime: new Date('2026-06-10T12:00:00Z') }],
        },
      ]);
      auditLogCreate.mockResolvedValue({ id: 'audit-3' });

      const url = await service.exportReport(
        businessId,
        userId,
        'customers',
        '2026-06-01',
        '2026-06-15',
        'csv',
      );

      expect(url).toEqual('https://cdn.rozx.in/mock-report-url.csv');
      expect(customerFindMany).toHaveBeenCalled();
    });

    it('should support xlsx and pdf formats', async () => {
      customerFindMany.mockResolvedValue([]);
      mockStorageService.uploadFile.mockResolvedValueOnce(
        'https://cdn.rozx.in/mock-report.xlsx',
      );
      mockStorageService.uploadFile.mockResolvedValueOnce(
        'https://cdn.rozx.in/mock-report.pdf',
      );

      const xlsxUrl = await service.exportReport(
        businessId,
        userId,
        'customers',
        undefined,
        undefined,
        'xlsx',
      );
      const pdfUrl = await service.exportReport(
        businessId,
        userId,
        'customers',
        undefined,
        undefined,
        'pdf',
      );

      expect(xlsxUrl).toEqual('https://cdn.rozx.in/mock-report.xlsx');
      expect(pdfUrl).toEqual('https://cdn.rozx.in/mock-report.pdf');
    });
  });

  describe('Async Queuing and status checks', () => {
    it('should queue export report successfully and set Redis PENDING status', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const result = await service.queueExportReport(businessId, userId, {
        reportType: 'appointments',
        startDate: '2026-06-01',
        endDate: '2026-06-15',
        format: 'csv',
        async: true,
      });

      expect(result).toHaveProperty('jobId');
      expect(result.status).toEqual('PENDING');
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringContaining('reports:status:'),
        expect.stringContaining('"status":"PENDING"'),
        'EX',
        86400,
      );
      expect(mockReportsQueue.add).toHaveBeenCalled();
    });

    it('should throw NotFoundException if export status is missing in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);
      await expect(
        service.getExportStatus(businessId, 'job-uuid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if getExportStatus businessId mismatch', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          status: 'PENDING',
          businessId: 'other-business',
          metadata: {},
        }),
      );

      await expect(
        service.getExportStatus(businessId, 'job-uuid'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should return job status and metadata correctly', async () => {
      mockRedis.get.mockResolvedValue(
        JSON.stringify({
          status: 'COMPLETED',
          businessId,
          fileUrl: 'https://cdn.rozx.in/completed.csv',
          metadata: { format: 'csv' },
        }),
      );

      const status = await service.getExportStatus(businessId, 'job-uuid');
      expect(status).toEqual({
        status: 'COMPLETED',
        fileUrl: 'https://cdn.rozx.in/completed.csv',
        error: undefined,
        metadata: { format: 'csv' },
      });
    });
  });

  describe('ReportsProcessor process method', () => {
    it('should process job, call exportReport, and update status to COMPLETED', async () => {
      appointmentFindMany.mockResolvedValue([]);
      mockStorageService.uploadFile.mockResolvedValue(
        'https://cdn.rozx.in/completed.csv',
      );
      mockRedis.set.mockResolvedValue('OK');

      const job: any = {
        data: {
          businessId,
          userId,
          reportType: 'appointments',
          startDate: '2026-06-01',
          endDate: '2026-06-15',
          format: 'csv',
          jobId: 'job-uuid-1',
        },
      };

      await processor.process(job);

      expect(mockRedis.set).toHaveBeenCalledWith(
        'reports:status:job-uuid-1',
        expect.stringContaining('"status":"COMPLETED"'),
        'EX',
        86400,
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        'reports:status:job-uuid-1',
        expect.stringContaining(
          '"fileUrl":"https://cdn.rozx.in/completed.csv"',
        ),
        'EX',
        86400,
      );
    });

    it('should process job, catch failures, and update status to FAILED', async () => {
      appointmentFindMany.mockRejectedValue(new Error('Database disconnect'));
      mockRedis.set.mockResolvedValue('OK');

      const job: any = {
        data: {
          businessId,
          userId,
          reportType: 'appointments',
          startDate: '2026-06-01',
          endDate: '2026-06-15',
          format: 'csv',
          jobId: 'job-uuid-2',
        },
      };

      await expect(processor.process(job)).rejects.toThrow(
        'Database disconnect',
      );

      expect(mockRedis.set).toHaveBeenCalledWith(
        'reports:status:job-uuid-2',
        expect.stringContaining('"status":"FAILED"'),
        'EX',
        86400,
      );
      expect(mockRedis.set).toHaveBeenCalledWith(
        'reports:status:job-uuid-2',
        expect.stringContaining('"error":"Database disconnect"'),
        'EX',
        86400,
      );
    });
  });
});
