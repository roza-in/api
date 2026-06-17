import { Test, TestingModule } from '@nestjs/testing';
import { TemplateService } from './template.service';
import { BadRequestException } from '@nestjs/common';

describe('TemplateService', () => {
  let service: TemplateService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TemplateService],
    }).compile();

    service = module.get<TemplateService>(TemplateService);
  });

  it('should render WhatsApp template payload correctly', () => {
    const variables = {
      customerName: 'Rahul',
      date: '16-06-2026',
      time: '11:00 AM',
      serviceName: 'Hair Styling',
      businessName: 'Glow Studio',
    };

    const result = service.render(
      'APPOINTMENT_CONFIRMATION',
      variables,
      'whatsapp',
    );

    expect(result.whatsapp).toBeDefined();
    expect(result.whatsapp?.templateName).toBe('appointment_confirmation');
    expect(result.whatsapp?.language).toBe('en');
    expect(result.whatsapp?.parameters).toEqual([
      'Rahul',
      '16-06-2026',
      '11:00 AM',
      'Hair Styling',
      'Glow Studio',
    ]);
  });

  it('should render SMS template payload correctly', () => {
    const variables = {
      customerName: 'Rahul',
      date: '16-06-2026',
      time: '11:00 AM',
      serviceName: 'Hair Styling',
    };

    const result = service.render('APPOINTMENT_CONFIRMATION', variables, 'sms');

    expect(result.sms).toBeDefined();
    expect(result.sms?.templateId).toBe('flow_appointment_conf');
    expect(result.sms?.variables).toEqual({
      customerName: 'Rahul',
      date: '16-06-2026',
      time: '11:00 AM',
      serviceName: 'Hair Styling',
    });
  });

  it('should render Email template payload correctly with interpolation', () => {
    const variables = {
      customerName: 'Rahul',
      date: '16-06-2026',
      time: '11:00 AM',
      serviceName: 'Hair Styling',
      businessName: 'Glow Studio',
    };

    const result = service.render(
      'APPOINTMENT_CONFIRMATION',
      variables,
      'email',
    );

    expect(result.email).toBeDefined();
    expect(result.email?.subject).toBe('Appointment Confirmed - Glow Studio');
    expect(result.email?.html).toContain('Hi Rahul');
    expect(result.email?.html).toContain('Hair Styling');
    expect(result.email?.html).toContain('Glow Studio');
  });

  it('should throw BadRequestException for unsupported template', () => {
    expect(() => {
      service.render('NON_EXISTENT_TEMPLATE', {}, 'whatsapp');
    }).toThrow(BadRequestException);
  });

  it('should throw BadRequestException if channel is not configured for the template', () => {
    expect(() => {
      // TRIAL_REMINDER only configured for email
      service.render(
        'TRIAL_REMINDER',
        { ownerName: 'Amit', daysRemaining: '3' },
        'whatsapp',
      );
    }).toThrow(BadRequestException);
  });
});
