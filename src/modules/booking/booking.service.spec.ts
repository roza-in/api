import { Test, TestingModule } from '@nestjs/testing';
import { BookingService } from './booking.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { AppointmentsService } from '../appointments/appointments.service';
import { AvailabilityService } from '../appointments/availability.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ConsentType, ConsentSource } from '../../generated/prisma';

const mockRedis = {
  incr: jest.fn(),
  expire: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('BookingService', () => {
  let service: BookingService;

  const businessFindUnique = jest.fn();
  const websiteFindFirst = jest.fn();
  const pageFindMany = jest.fn();
  const branchFindMany = jest.fn();
  const serviceCategoryFindMany = jest.fn();
  const serviceFindMany = jest.fn();
  const staffFindMany = jest.fn();
  const customerFindFirst = jest.fn();
  const customerCreate = jest.fn();
  const customerUpdate = jest.fn();
  const consentCreate = jest.fn();
  const businessMemberFindFirst = jest.fn();
  const prismaTransaction = jest.fn();

  const mockPrisma = {
    business: {
      findUnique: businessFindUnique,
    },
    website: {
      findFirst: websiteFindFirst,
    },
    page: {
      findMany: pageFindMany,
    },
    branch: {
      findMany: branchFindMany,
    },
    serviceCategory: {
      findMany: serviceCategoryFindMany,
    },
    service: {
      findMany: serviceFindMany,
    },
    staff: {
      findMany: staffFindMany,
    },
    customer: {
      findFirst: customerFindFirst,
      create: customerCreate,
      update: customerUpdate,
    },
    consent: {
      create: consentCreate,
    },
    businessMember: {
      findFirst: businessMemberFindFirst,
    },
    $transaction: prismaTransaction,
  };

  const mockConfigService = {
    getOrThrow: jest.fn().mockReturnValue('redis://localhost:6379'),
  };

  const mockAppointmentsService = {
    createAppointment: jest.fn(),
  };

  const mockAvailabilityService = {
    getAvailableSlots: jest.fn(),
  };

  const mockNotificationsService = {
    send: jest.fn(),
  };

  beforeEach(async () => {
    prismaTransaction.mockImplementation(async (arg: unknown) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg);
      }
      if (typeof arg === 'function') {
        const cb = arg as (tx: typeof mockPrisma) => Promise<unknown>;
        return cb(mockPrisma);
      }
      return arg;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AppointmentsService, useValue: mockAppointmentsService },
        { provide: AvailabilityService, useValue: mockAvailabilityService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<BookingService>(BookingService);

    jest.clearAllMocks();
  });

  describe('checkRateLimit', () => {
    it('should pass if count is within limit', async () => {
      mockRedis.incr.mockResolvedValue(5);
      await expect(
        service.checkRateLimit('127.0.0.1', 10, 60),
      ).resolves.not.toThrow();
      expect(mockRedis.incr).toHaveBeenCalledWith(
        'ratelimit:booking:127.0.0.1',
      );
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });

    it('should set expiry if count is 1', async () => {
      mockRedis.incr.mockResolvedValue(1);
      await expect(
        service.checkRateLimit('127.0.0.1', 10, 60),
      ).resolves.not.toThrow();
      expect(mockRedis.expire).toHaveBeenCalledWith(
        'ratelimit:booking:127.0.0.1',
        60,
      );
    });

    it('should throw HttpException if count exceeds limit', async () => {
      mockRedis.incr.mockResolvedValue(11);
      await expect(service.checkRateLimit('127.0.0.1', 10, 60)).rejects.toThrow(
        new HttpException(
          'Too many requests. Please try again later.',
          HttpStatus.TOO_MANY_REQUESTS,
        ),
      );
    });
  });

  describe('getBusinessInfo', () => {
    const slug = 'test-business';
    const mockBusiness = { id: 'bus-1', slug, name: 'Test Business' };

    it('should throw NotFoundException if business is not found', async () => {
      businessFindUnique.mockResolvedValue(null);
      await expect(service.getBusinessInfo(slug)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return business, website, pages and branches if found', async () => {
      businessFindUnique.mockResolvedValue(mockBusiness);
      const mockWebsite = { id: 'web-1', themeId: 'theme-1' };
      websiteFindFirst.mockResolvedValue(mockWebsite);
      const mockPages = [{ id: 'page-1', title: 'Home' }];
      pageFindMany.mockResolvedValue(mockPages);
      const mockBranches = [{ id: 'branch-1', name: 'Branch 1' }];
      branchFindMany.mockResolvedValue(mockBranches);

      const result = await service.getBusinessInfo(slug);

      expect(result).toEqual({
        business: mockBusiness,
        website: mockWebsite,
        pages: mockPages,
        branches: mockBranches,
      });
      expect(businessFindUnique).toHaveBeenCalledWith({
        where: { slug, deletedAt: null },
      });
      expect(websiteFindFirst).toHaveBeenCalledWith({
        where: { businessId: 'bus-1', deletedAt: null },
        include: { theme: true },
      });
      expect(pageFindMany).toHaveBeenCalledWith({
        where: { websiteId: 'web-1', isPublished: true, deletedAt: null },
      });
      expect(branchFindMany).toHaveBeenCalledWith({
        where: { businessId: 'bus-1', deletedAt: null },
      });
    });

    it('should return empty pages array if website is not found', async () => {
      businessFindUnique.mockResolvedValue(mockBusiness);
      websiteFindFirst.mockResolvedValue(null);
      const mockBranches = [{ id: 'branch-1', name: 'Branch 1' }];
      branchFindMany.mockResolvedValue(mockBranches);

      const result = await service.getBusinessInfo(slug);

      expect(result).toEqual({
        business: mockBusiness,
        website: null,
        pages: [],
        branches: mockBranches,
      });
    });
  });

  describe('getServices', () => {
    const slug = 'test-business';
    const mockBusiness = { id: 'bus-1', slug };

    it('should throw NotFoundException if business is not found', async () => {
      businessFindUnique.mockResolvedValue(null);
      await expect(service.getServices(slug)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return categories and services if business is found', async () => {
      businessFindUnique.mockResolvedValue(mockBusiness);
      const mockCategories = [{ id: 'cat-1', name: 'Cat 1' }];
      const mockServices = [
        { id: 'srv-1', name: 'Srv 1', categoryId: 'cat-1' },
      ];
      serviceCategoryFindMany.mockResolvedValue(mockCategories);
      serviceFindMany.mockResolvedValue(mockServices);

      const result = await service.getServices(slug);

      expect(result).toEqual({
        categories: mockCategories,
        services: mockServices,
      });
      expect(serviceCategoryFindMany).toHaveBeenCalledWith({
        where: { businessId: 'bus-1', isActive: true, deletedAt: null },
      });
      expect(serviceFindMany).toHaveBeenCalledWith({
        where: { businessId: 'bus-1', isActive: true, deletedAt: null },
        include: { category: true },
      });
    });
  });

  describe('getStaff', () => {
    const slug = 'test-business';
    const mockBusiness = { id: 'bus-1', slug };

    it('should throw NotFoundException if business not found', async () => {
      businessFindUnique.mockResolvedValue(null);
      await expect(service.getStaff(slug)).rejects.toThrow(NotFoundException);
    });

    it('should return active staff list', async () => {
      businessFindUnique.mockResolvedValue(mockBusiness);
      const mockStaff = [{ id: 'staff-1', name: 'Staff 1' }];
      staffFindMany.mockResolvedValue(mockStaff);

      const result = await service.getStaff(slug);
      expect(result).toEqual(mockStaff);
      expect(staffFindMany).toHaveBeenCalledWith({
        where: { businessId: 'bus-1', isActive: true, deletedAt: null },
        include: {
          services: {
            include: { service: true },
          },
        },
      });
    });
  });

  describe('getAvailability', () => {
    const slug = 'test-business';
    const mockBusiness = { id: 'bus-1', slug };
    const query = {
      branchId: 'br-1',
      serviceId: 'srv-1',
      date: '2026-06-16',
    };

    it('should throw NotFoundException if business not found', async () => {
      businessFindUnique.mockResolvedValue(null);
      await expect(service.getAvailability(slug, query)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delegate to AvailabilityService', async () => {
      businessFindUnique.mockResolvedValue(mockBusiness);
      const mockSlots = [
        { startTime: '2026-06-16T10:00:00Z', endTime: '2026-06-16T11:00:00Z' },
      ];
      mockAvailabilityService.getAvailableSlots.mockResolvedValue(mockSlots);

      const result = await service.getAvailability(slug, query);
      expect(result).toEqual(mockSlots);
      expect(mockAvailabilityService.getAvailableSlots).toHaveBeenCalledWith(
        'bus-1',
        query,
      );
    });
  });

  describe('bookAppointment', () => {
    const slug = 'test-business';
    const mockBusiness = { id: 'bus-1', slug, name: 'Test Business' };
    const baseDto = {
      customerName: 'Alice',
      customerPhone: '+919999999999',
      branchId: 'br-1',
      serviceId: 'srv-1',
      startTime: '2026-06-16T10:00:00.000Z',
    };

    it('should throw NotFoundException if business not found', async () => {
      businessFindUnique.mockResolvedValue(null);
      await expect(service.bookAppointment(slug, baseDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if Any Staff is selected but no active candidates exist', async () => {
      businessFindUnique.mockResolvedValue(mockBusiness);
      staffFindMany.mockResolvedValue([]);

      await expect(service.bookAppointment(slug, baseDto)).rejects.toThrow(
        BadRequestException,
      );
      expect(staffFindMany).toHaveBeenCalledWith({
        where: {
          businessId: 'bus-1',
          branchId: 'br-1',
          isActive: true,
          deletedAt: null,
          services: { some: { serviceId: 'srv-1' } },
        },
      });
    });

    it('should throw ConflictException if Any Staff is selected but no candidate has slot availability', async () => {
      businessFindUnique.mockResolvedValue(mockBusiness);
      staffFindMany.mockResolvedValue([{ id: 'staff-1' }, { id: 'staff-2' }]);
      mockAvailabilityService.getAvailableSlots.mockResolvedValue([]);

      await expect(service.bookAppointment(slug, baseDto)).rejects.toThrow(
        ConflictException,
      );
      expect(mockAvailabilityService.getAvailableSlots).toHaveBeenCalledTimes(
        2,
      );
    });

    it('should resolve staff and book successfully if Any Staff is selected and a candidate has slot availability', async () => {
      businessFindUnique.mockResolvedValue(mockBusiness);
      staffFindMany.mockResolvedValue([{ id: 'staff-1' }, { id: 'staff-2' }]);
      mockAvailabilityService.getAvailableSlots
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ startTime: '2026-06-16T10:00:00.000Z' }]);

      customerFindFirst.mockResolvedValue(null);
      const mockCustomer = {
        id: 'cust-1',
        name: 'Alice',
        phone: '+919999999999',
      };
      customerCreate.mockResolvedValue(mockCustomer);

      const mockAppointment = {
        id: 'apt-1',
        startTime: '2026-06-16T10:00:00.000Z',
        service: { name: 'Haircut' },
      };
      mockAppointmentsService.createAppointment.mockResolvedValue(
        mockAppointment,
      );

      const dto = {
        ...baseDto,
        consents: { marketingWhatsapp: true },
      };

      const result = await service.bookAppointment(slug, dto);

      expect(result).toEqual(mockAppointment);
      expect(customerCreate).toHaveBeenCalledWith({
        data: {
          businessId: 'bus-1',
          name: 'Alice',
          phone: '+919999999999',
          email: null,
        },
      });
      expect(consentCreate).toHaveBeenCalledWith({
        data: {
          businessId: 'bus-1',
          customerId: 'cust-1',
          consentType: ConsentType.MARKETING_WHATSAPP,
          granted: true,
          source: ConsentSource.BOOKING_FORM,
        },
      });
      expect(mockAppointmentsService.createAppointment).toHaveBeenCalledWith(
        'bus-1',
        null,
        {
          branchId: 'br-1',
          staffId: 'staff-2',
          customerId: 'cust-1',
          serviceId: 'srv-1',
          startTime: '2026-06-16T10:00:00.000Z',
          notes: undefined,
        },
      );
      expect(mockNotificationsService.send).toHaveBeenCalled();
    });

    it('should use provided staffId and update customer name/email if changed, and book successfully', async () => {
      businessFindUnique.mockResolvedValue(mockBusiness);
      const existingCustomer = {
        id: 'cust-1',
        name: 'Alice Old',
        phone: '+919999999999',
        email: null,
      };
      customerFindFirst.mockResolvedValue(existingCustomer);
      customerUpdate.mockResolvedValue({
        ...existingCustomer,
        name: 'Alice',
        email: 'alice@example.com',
      });

      const mockAppointment = {
        id: 'apt-1',
        startTime: '2026-06-16T10:00:00.000Z',
        service: { name: 'Haircut' },
      };
      mockAppointmentsService.createAppointment.mockResolvedValue(
        mockAppointment,
      );

      const dto = {
        ...baseDto,
        staffId: 'staff-1',
        customerEmail: 'alice@example.com',
      };

      const result = await service.bookAppointment(slug, dto);

      expect(result).toEqual(mockAppointment);
      expect(customerFindFirst).toHaveBeenCalledWith({
        where: { businessId: 'bus-1', phone: '+919999999999', deletedAt: null },
      });
      expect(customerUpdate).toHaveBeenCalledWith({
        where: { id: 'cust-1' },
        data: { name: 'Alice', email: 'alice@example.com' },
      });
      expect(mockAppointmentsService.createAppointment).toHaveBeenCalledWith(
        'bus-1',
        null,
        {
          branchId: 'br-1',
          staffId: 'staff-1',
          customerId: 'cust-1',
          serviceId: 'srv-1',
          startTime: '2026-06-16T10:00:00.000Z',
          notes: undefined,
        },
      );
    });
  });
});
