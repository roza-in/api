jest.mock('uuid', () => ({ v4: () => 'mock-uuid' }));
import { Test, TestingModule } from '@nestjs/testing';
import { MonitoringInterceptor } from './monitoring.interceptor';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';

const mockRedis = {
  incr: jest.fn().mockResolvedValue(1),
  incrby: jest.fn().mockResolvedValue(1),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('MonitoringInterceptor', () => {
  let interceptor: MonitoringInterceptor;

  const mockConfigService = {
    get: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  const mockRequest = {
    url: '/businesses/customers',
  };

  const mockExecutionContext = {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
    }),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MonitoringInterceptor,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    interceptor = module.get<MonitoringInterceptor>(MonitoringInterceptor);
    jest.clearAllMocks();
  });

  it('should record request telemetry for successful requests', (done) => {
    const mockCallHandler: CallHandler = {
      handle: () => of('success-response'),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(mockRedis.incr).toHaveBeenCalledWith(
          'monitoring:requests:total',
        );
        expect(mockRedis.incrby).toHaveBeenCalledWith(
          'monitoring:latency:sum',
          expect.any(Number),
        );
        expect(mockRedis.incr).toHaveBeenCalledWith('monitoring:latency:count');
        expect(mockRedis.incr).not.toHaveBeenCalledWith(
          'monitoring:requests:errors',
        );
        done();
      },
    });
  });

  it('should record request telemetry and increment error counts for failed requests', (done) => {
    const mockCallHandler: CallHandler = {
      handle: () => throwError(() => new Error('API failure')),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      error: () => {
        expect(mockRedis.incr).toHaveBeenCalledWith(
          'monitoring:requests:total',
        );
        expect(mockRedis.incr).toHaveBeenCalledWith(
          'monitoring:requests:errors',
        );
        expect(mockRedis.incrby).toHaveBeenCalledWith(
          'monitoring:latency:sum',
          expect.any(Number),
        );
        expect(mockRedis.incr).toHaveBeenCalledWith('monitoring:latency:count');
        done();
      },
    });
  });

  it('should skip monitoring for health and status endpoints', (done) => {
    const mockHealthRequest = {
      url: '/health',
    };
    const mockHealthExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockHealthRequest,
      }),
    } as unknown as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => of('healthy'),
    };

    interceptor
      .intercept(mockHealthExecutionContext, mockCallHandler)
      .subscribe({
        next: () => {
          expect(mockRedis.incr).not.toHaveBeenCalled();
          expect(mockRedis.incrby).not.toHaveBeenCalled();
          done();
        },
      });
  });
});
