import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { ConflictService } from './conflict.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { AppointmentStatus } from '../../generated/prisma';

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  const mockCustomerFindFirst = jest.fn();
  const mockAppointmentCreate = jest.fn();
  const mockAppointmentFindMany = jest.fn();
  const mockAppointmentCount = jest.fn();
  const mockAppointmentFindFirst = jest.fn();
  const mockAppointmentUpdateMany = jest.fn();
  const mockAppointmentUpdate = jest.fn();
  const mockAppointmentFindUniqueOrThrow = jest.fn();
  const mockAuditLogCreate = jest.fn();

  const mockPrisma = {
    customer: { findFirst: mockCustomerFindFirst },
    appointment: {
      create: mockAppointmentCreate,
      findMany: mockAppointmentFindMany,
      count: mockAppointmentCount,
      findFirst: mockAppointmentFindFirst,
      updateMany: mockAppointmentUpdateMany,
      update: mockAppointmentUpdate,
      findUniqueOrThrow: mockAppointmentFindUniqueOrThrow,
    },
    auditLog: { create: mockAuditLogCreate },
    $transaction: jest.fn(),
  };

  const mockConflictService = {
    checkConflict: jest.fn(),
  };

  const mockNotificationsService = {
    send: jest.fn(),
  };

  const businessId = 'biz-1';
  const userId = 'user-1';
  const appointmentId = 'appt-1';

  const mockAppt = {
    id: appointmentId,
    businessId,
    branchId: 'branch-1',
    staffId: 'staff-1',
    customerId: 'cust-1',
    serviceId: 'srv-1',
    startTime: new Date('2026-06-15T10:00:00Z'),
    endTime: new Date('2026-06-15T10:45:00Z'),
    status: AppointmentStatus.CONFIRMED,
    notes: 'Testing notes',
    version: 1,
    branch: { timezone: 'Asia/Kolkata', address: '123 St' },
    customer: { name: 'John Doe' },
    service: { name: 'Haircut' },
  };

  beforeEach(async () => {
    mockPrisma.$transaction.mockImplementation(async (arg: unknown) => {
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
        AppointmentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConflictService, useValue: mockConflictService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
    jest.clearAllMocks();
  });

  describe('createAppointment', () => {
    const createDto = {
      branchId: 'branch-1',
      staffId: 'staff-1',
      customerId: 'cust-1',
      serviceId: 'srv-1',
      startTime: '2026-06-15T10:00:00Z',
      notes: 'Testing notes',
    };

    it('should successfully create an appointment and log the audit entry', async () => {
      mockCustomerFindFirst.mockResolvedValue({ id: 'cust-1' });
      mockConflictService.checkConflict.mockResolvedValue({
        pStart: new Date(createDto.startTime),
        pEnd: new Date('2026-06-15T10:45:00Z'),
      });
      mockAppointmentCreate.mockResolvedValue(mockAppt);

      const result = await service.createAppointment(
        businessId,
        userId,
        createDto,
      );

      expect(result).toEqual(mockAppt);
      expect(mockCustomerFindFirst).toHaveBeenCalledWith({
        where: { id: 'cust-1', businessId, deletedAt: null },
      });
      expect(mockConflictService.checkConflict).toHaveBeenCalledWith(
        businessId,
        {
          branchId: createDto.branchId,
          staffId: createDto.staffId,
          serviceId: createDto.serviceId,
          startTime: createDto.startTime,
        },
      );
      expect(mockAppointmentCreate).toHaveBeenCalledWith({
        data: {
          businessId,
          branchId: createDto.branchId,
          staffId: createDto.staffId,
          customerId: createDto.customerId,
          serviceId: createDto.serviceId,
          startTime: new Date(createDto.startTime),
          endTime: new Date('2026-06-15T10:45:00Z'),
          status: AppointmentStatus.CONFIRMED,
          notes: createDto.notes,
          createdBy: userId,
          updatedBy: userId,
        },
        include: {
          branch: true,
          staff: true,
          customer: true,
          service: true,
          business: true,
        },
      });
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: {
          businessId,
          userId,
          action: 'CREATE',
          entity: 'Appointment',
          entityId: mockAppt.id,
          metadata: {
            startTime: mockAppt.startTime,
            staffId: mockAppt.staffId,
            serviceId: mockAppt.serviceId,
          },
        },
      });
    });

    it('should throw NotFoundException if customer does not exist', async () => {
      mockCustomerFindFirst.mockResolvedValue(null);

      await expect(
        service.createAppointment(businessId, userId, createDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAll', () => {
    it('should return paginated appointments', async () => {
      const mockList = [mockAppt];
      mockAppointmentFindMany.mockResolvedValue(mockList);
      mockAppointmentCount.mockResolvedValue(1);

      const result = await service.findAll(businessId, { page: 1, limit: 10 });

      expect(result).toEqual({
        items: mockList,
        total: 1,
        page: 1,
        limit: 10,
      });
    });
  });

  describe('findOne', () => {
    it('should return appointment details', async () => {
      mockAppointmentFindFirst.mockResolvedValue(mockAppt);

      const result = await service.findOne(businessId, appointmentId);

      expect(result).toEqual(mockAppt);
    });

    it('should throw NotFoundException if appointment does not exist', async () => {
      mockAppointmentFindFirst.mockResolvedValue(null);

      await expect(service.findOne(businessId, appointmentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateAppointment', () => {
    const updateDto = {
      startTime: '2026-06-15T11:00:00Z',
      version: 1,
    };

    it('should update appointment and transition status to RESCHEDULED if time changed', async () => {
      mockAppointmentFindFirst.mockResolvedValue(mockAppt);
      mockConflictService.checkConflict.mockResolvedValue({
        pStart: new Date(updateDto.startTime),
        pEnd: new Date('2026-06-15T11:45:00Z'),
      });
      mockAppointmentUpdateMany.mockResolvedValue({ count: 1 });

      const updatedAppt = {
        ...mockAppt,
        startTime: new Date(updateDto.startTime),
        endTime: new Date('2026-06-15T11:45:00Z'),
        status: AppointmentStatus.RESCHEDULED,
        version: 2,
      };
      mockAppointmentFindUniqueOrThrow.mockResolvedValue(updatedAppt);

      const result = await service.updateAppointment(
        businessId,
        userId,
        appointmentId,
        updateDto,
      );

      expect(result).toEqual(updatedAppt);
      expect(mockConflictService.checkConflict).toHaveBeenCalledWith(
        businessId,
        {
          branchId: mockAppt.branchId,
          staffId: mockAppt.staffId,
          serviceId: mockAppt.serviceId,
          startTime: updateDto.startTime,
          ignoreAppointmentId: appointmentId,
        },
      );
      expect(mockAppointmentUpdateMany).toHaveBeenCalledWith({
        where: { id: appointmentId, businessId, version: 1, deletedAt: null },
        data: {
          branchId: mockAppt.branchId,
          staffId: mockAppt.staffId,
          customerId: mockAppt.customerId,
          serviceId: mockAppt.serviceId,
          startTime: new Date(updateDto.startTime),
          endTime: new Date('2026-06-15T11:45:00Z'),
          status: AppointmentStatus.RESCHEDULED,
          notes: mockAppt.notes,
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    });

    it('should append cancellation reason to notes if status changed to CANCELLED', async () => {
      mockAppointmentFindFirst.mockResolvedValue(mockAppt);
      mockAppointmentUpdateMany.mockResolvedValue({ count: 1 });

      const cancelDto = {
        status: AppointmentStatus.CANCELLED,
        cancellationReason: 'Customer felt sick',
        version: 1,
      };

      const updatedAppt = {
        ...mockAppt,
        status: AppointmentStatus.CANCELLED,
        notes: 'Testing notes\nCancellation Reason: Customer felt sick',
        version: 2,
      };
      mockAppointmentFindUniqueOrThrow.mockResolvedValue(updatedAppt);

      const result = await service.updateAppointment(
        businessId,
        userId,
        appointmentId,
        cancelDto,
      );

      expect(result).toEqual(updatedAppt);
      expect(mockAppointmentUpdateMany).toHaveBeenCalledWith({
        where: { id: appointmentId, businessId, version: 1, deletedAt: null },
        data: {
          branchId: mockAppt.branchId,
          staffId: mockAppt.staffId,
          customerId: mockAppt.customerId,
          serviceId: mockAppt.serviceId,
          startTime: undefined,
          endTime: undefined,
          status: AppointmentStatus.CANCELLED,
          notes: 'Testing notes\nCancellation Reason: Customer felt sick',
          updatedBy: userId,
          version: { increment: 1 },
        },
      });
    });

    it('should throw ConflictException if version does not match', async () => {
      mockAppointmentFindFirst.mockResolvedValue(mockAppt);

      const mismatchDto = {
        version: 99,
      };

      await expect(
        service.updateAppointment(
          businessId,
          userId,
          appointmentId,
          mismatchDto,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('softDelete', () => {
    it('should set deletedAt and log audit entry', async () => {
      mockAppointmentFindFirst.mockResolvedValue(mockAppt);
      mockAppointmentUpdate.mockResolvedValue({});

      const result = await service.softDelete(
        businessId,
        userId,
        appointmentId,
      );

      expect(result).toEqual({ message: 'Appointment deleted successfully' });
      expect(mockAppointmentUpdate).toHaveBeenCalledWith({
        where: { id: appointmentId },
        data: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          deletedAt: expect.any(Date),
          updatedBy: userId,
        },
      });
      expect(mockAuditLogCreate).toHaveBeenCalledWith({
        data: {
          businessId,
          userId,
          action: 'DELETE',
          entity: 'Appointment',
          entityId: appointmentId,
          metadata: {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            deletedAt: expect.any(Date),
          },
        },
      });
    });
  });
});
