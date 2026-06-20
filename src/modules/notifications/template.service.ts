import { Injectable, BadRequestException } from '@nestjs/common';

export interface TemplateRenderResult {
  whatsapp?: {
    templateName: string;
    language: string;
    parameters: string[];
  };
  sms?: {
    templateId: string;
    variables: Record<string, string>;
  };
  email?: {
    subject: string;
    html: string;
  };
}

const TEMPLATES: Record<
  string,
  {
    whatsapp?: {
      templateName: string;
      language?: string;
      parameterKeys: string[];
    };
    sms?: {
      templateId: string;
      variableKeys: string[];
    };
    email?: {
      subjectTemplate: string;
      htmlTemplate: string;
    };
  }
> = {
  APPOINTMENT_CONFIRMATION: {
    whatsapp: {
      templateName: 'appointment_confirmation',
      parameterKeys: [
        'customerName',
        'date',
        'time',
        'serviceName',
        'businessName',
      ],
    },
    sms: {
      templateId: 'flow_appointment_conf',
      variableKeys: ['customerName', 'date', 'time', 'serviceName'],
    },
    email: {
      subjectTemplate: 'Appointment Confirmed - {{businessName}}',
      htmlTemplate:
        '<p>Hi {{customerName}},</p><p>Your appointment for <strong>{{serviceName}}</strong> at {{businessName}} is confirmed for {{date}} at {{time}}.</p>',
    },
  },
  APPOINTMENT_REMINDER: {
    whatsapp: {
      templateName: 'appointment_reminder',
      parameterKeys: [
        'customerName',
        'date',
        'time',
        'serviceName',
        'branchAddress',
        'businessName',
      ],
    },
    sms: {
      templateId: 'flow_appointment_rem',
      variableKeys: ['customerName', 'date', 'time', 'serviceName'],
    },
    email: {
      subjectTemplate: 'Reminder: Appointment Tomorrow - {{businessName}}',
      htmlTemplate:
        '<p>Hi {{customerName}},</p><p>This is a reminder for your upcoming appointment for <strong>{{serviceName}}</strong> tomorrow at {{time}}.</p>',
    },
  },
  APPOINTMENT_RESCHEDULED: {
    whatsapp: {
      templateName: 'appointment_rescheduled',
      parameterKeys: [
        'customerName',
        'oldDate',
        'oldTime',
        'newDate',
        'newTime',
        'serviceName',
        'businessName',
      ],
    },
    sms: {
      templateId: 'flow_appointment_resched',
      variableKeys: ['customerName', 'newDate', 'newTime', 'serviceName'],
    },
    email: {
      subjectTemplate: 'Appointment Rescheduled - {{businessName}}',
      htmlTemplate:
        '<p>Hi {{customerName}},</p><p>Your appointment has been rescheduled to {{newDate}} at {{newTime}}.</p>',
    },
  },
  APPOINTMENT_CANCELLED: {
    whatsapp: {
      templateName: 'appointment_cancelled',
      parameterKeys: [
        'customerName',
        'date',
        'time',
        'serviceName',
        'businessName',
      ],
    },
    sms: {
      templateId: 'flow_appointment_cancel',
      variableKeys: ['customerName', 'date', 'serviceName'],
    },
    email: {
      subjectTemplate: 'Appointment Cancelled - {{businessName}}',
      htmlTemplate:
        '<p>Hi {{customerName}},</p><p>Your appointment for {{serviceName}} on {{date}} has been cancelled.</p>',
    },
  },
  PAYMENT_RECEIPT: {
    whatsapp: {
      templateName: 'payment_receipt',
      parameterKeys: [
        'customerName',
        'amount',
        'invoiceNumber',
        'businessName',
      ],
    },
    sms: {
      templateId: 'flow_payment_receipt',
      variableKeys: ['customerName', 'amount', 'invoiceNumber'],
    },
    email: {
      subjectTemplate: 'Payment Receipt - {{invoiceNumber}}',
      htmlTemplate:
        '<p>Hi {{customerName}},</p><p>Thank you for your payment of {{amount}} for invoice {{invoiceNumber}}.</p>',
    },
  },
  TRIAL_REMINDER: {
    email: {
      subjectTemplate: 'Your Rozx trial ends in {{daysRemaining}} days',
      htmlTemplate:
        '<p>Hi {{ownerName}},</p><p>This is a reminder that your trial subscription for Rozx ends in {{daysRemaining}} days. Upgrade now to keep accessing all features.</p>',
    },
  },
  SUBSCRIPTION_RENEWAL: {
    email: {
      subjectTemplate: 'Rozx Subscription Renewed Successfully',
      htmlTemplate:
        '<p>Hi {{ownerName}},</p><p>Your subscription has been successfully renewed. Thank you for using Rozx!</p>',
    },
  },
  PAYMENT_FAILURE: {
    whatsapp: {
      templateName: 'payment_failed',
      parameterKeys: ['customerName', 'amount', 'businessName'],
    },
    sms: {
      templateId: 'flow_payment_fail',
      variableKeys: ['customerName', 'amount'],
    },
    email: {
      subjectTemplate: 'Payment Failed - Action Required',
      htmlTemplate:
        '<p>Hi {{customerName}},</p><p>Your payment of {{amount}} could not be processed. Please try again.</p>',
    },
  },
  SECURITY_ALERT: {
    email: {
      subjectTemplate: 'Security Alert - New Login Detected',
      htmlTemplate:
        '<p>Hi {{name}},</p><p>A new login was detected on your account at {{time}} from IP {{ipAddress}}.</p>',
    },
  },
  PROMO_CAMPAIGN: {
    whatsapp: {
      templateName: 'promo_campaign',
      parameterKeys: [
        'customerName',
        'offerDetails',
        'expiryDate',
        'businessName',
      ],
    },
    sms: {
      templateId: 'flow_promo_campaign',
      variableKeys: ['customerName', 'offerDetails', 'expiryDate'],
    },
    email: {
      subjectTemplate: 'Special Promotion from {{businessName}}',
      htmlTemplate:
        '<p>Hi {{customerName}},</p><p>{{offerDetails}}</p><p>Valid until {{expiryDate}}.</p>',
    },
  },
  MARKETING_OFFER: {
    whatsapp: {
      templateName: 'marketing_offer',
      parameterKeys: [
        'customerName',
        'offerDetails',
        'expiryDate',
        'businessName',
      ],
    },
    sms: {
      templateId: 'flow_marketing_offer',
      variableKeys: ['customerName', 'offerDetails', 'expiryDate'],
    },
    email: {
      subjectTemplate: 'Exclusive Offer: {{offerDetails}}',
      htmlTemplate:
        '<p>Hi {{customerName}},</p><p>We have a special offer for you: <strong>{{offerDetails}}</strong>.</p><p>Book now! Expiry: {{expiryDate}}.</p>',
    },
  },
  STAFF_INVITATION: {
    email: {
      subjectTemplate: 'Invitation to join {{businessName}} on Rozx',
      htmlTemplate:
        '<div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 12px;"><h2 style="color: #10b981; text-align: center;">Welcome to Rozx</h2><p>Hello {{staffName}},</p><p>You have been invited by <strong>{{businessName}}</strong> to join their team on the Rozx Partner Portal.</p><p>Click the button below to set up your password and activate your account. This invitation is valid for 24 hours.</p><div style="text-align: center; margin: 30px 0;"><a href="{{inviteUrl}}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">Accept Invitation & Set Password</a></div><p style="color: #6b7280; font-size: 12px;">If the button above does not work, copy and paste this link into your browser:</p><p style="color: #10b981; font-size: 12px; word-break: break-all;"><a href="{{inviteUrl}}">{{inviteUrl}}</a></p><p style="color: #6b7280; font-size: 12px; margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 20px;">This is an automated invitation. Please do not reply to this message.<br>© 2026 Rozx Technologies. All rights reserved.</p></div>',
    },
  },
};

@Injectable()
export class TemplateService {
  render(
    templateId: string,
    variables: Record<string, string>,
    channel: 'whatsapp' | 'sms' | 'email',
  ): TemplateRenderResult {
    const template = TEMPLATES[templateId];
    if (!template) {
      throw new BadRequestException(`Template with ID ${templateId} not found`);
    }

    const result: TemplateRenderResult = {};

    if (channel === 'whatsapp' && template.whatsapp) {
      const {
        templateName,
        language = 'en',
        parameterKeys,
      } = template.whatsapp;
      const parameters = parameterKeys.map((key) => variables[key] || '');
      result.whatsapp = {
        templateName,
        language,
        parameters,
      };
    }

    if (channel === 'sms' && template.sms) {
      const { templateId: flowId, variableKeys } = template.sms;
      const smsVars: Record<string, string> = {};
      variableKeys.forEach((key) => {
        smsVars[key] = variables[key] || '';
      });
      result.sms = {
        templateId: flowId,
        variables: smsVars,
      };
    }

    if (channel === 'email' && template.email) {
      const { subjectTemplate, htmlTemplate } = template.email;
      result.email = {
        subject: this.interpolate(subjectTemplate, variables),
        html: this.interpolate(htmlTemplate, variables),
      };
    }

    if (!result[channel]) {
      throw new BadRequestException(
        `Channel ${channel} is not supported for template ${templateId}`,
      );
    }

    return result;
  }

  private interpolate(text: string, variables: Record<string, string>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
      const val = variables[key];
      return typeof val === 'string' ? val : '';
    });
  }
}
