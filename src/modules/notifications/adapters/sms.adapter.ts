import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface Msg91Response {
  type?: string;
  message?: string;
}

@Injectable()
export class SmsAdapter {
  private readonly logger = new Logger(SmsAdapter.name);
  private readonly authKey: string;
  private readonly senderId: string;

  constructor(private readonly configService: ConfigService) {
    this.authKey = this.configService.getOrThrow<string>('MSG91_AUTH_KEY');
    this.senderId = this.configService.getOrThrow<string>('MSG91_SENDER_ID');
  }

  async sendSms(
    to: string,
    templateId: string,
    variables: Record<string, string> = {},
  ): Promise<string> {
    const formattedPhone = this.formatPhoneNumber(to);
    const url = 'https://control.msg91.com/api/v5/flow/';

    const body = {
      template_id: templateId,
      sender: this.senderId,
      recipients: [
        {
          mobiles: formattedPhone,
          ...variables,
        },
      ],
    };

    try {
      this.logger.debug(
        `Sending MSG91 SMS to ${formattedPhone}: ${JSON.stringify(body)}`,
      );
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          authkey: this.authKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as Msg91Response;

      if (!response.ok || data?.type === 'error') {
        throw new Error(
          data?.message || `HTTP error! status: ${response.status}`,
        );
      }

      const requestId = data?.message;
      if (!requestId) {
        throw new Error('No request ID returned from MSG91 API');
      }

      this.logger.log(
        `MSG91 SMS sent successfully to ${formattedPhone}, request ID: ${requestId}`,
      );
      return requestId;
    } catch (error) {
      this.logger.error(
        `Failed to send MSG91 SMS to ${formattedPhone}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  private formatPhoneNumber(phone: string): string {
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10) {
      digits = `91${digits}`;
    }
    return digits;
  }
}
