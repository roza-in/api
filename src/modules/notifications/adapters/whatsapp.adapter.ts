import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface WhatsAppErrorObject {
  message: string;
}

interface WhatsAppResponse {
  error?: WhatsAppErrorObject;
  messages?: { id: string }[];
}

@Injectable()
export class WhatsAppAdapter {
  private readonly logger = new Logger(WhatsAppAdapter.name);
  private readonly apiUrl: string;
  private readonly accessToken: string;

  constructor(private readonly configService: ConfigService) {
    this.apiUrl = this.configService.getOrThrow<string>('WHATSAPP_API_URL');
    this.accessToken = this.configService.getOrThrow<string>(
      'WHATSAPP_ACCESS_TOKEN',
    );
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode = 'en',
    parameters: string[] = [],
  ): Promise<string> {
    const formattedPhone = this.formatPhoneNumber(to);
    const url = `${this.apiUrl}/messages`;

    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: formattedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: languageCode,
        },
        components:
          parameters.length > 0
            ? [
                {
                  type: 'body',
                  parameters: parameters.map((param) => ({
                    type: 'text',
                    text: param,
                  })),
                },
              ]
            : [],
      },
    };

    try {
      this.logger.debug(
        `Sending WhatsApp template to ${formattedPhone}: ${JSON.stringify(body)}`,
      );
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = (await response.json()) as WhatsAppResponse;

      if (!response.ok) {
        throw new Error(
          data?.error?.message || `HTTP error! status: ${response.status}`,
        );
      }

      const messageId = data?.messages?.[0]?.id;
      if (!messageId) {
        throw new Error('No message ID returned from Meta API');
      }

      this.logger.log(
        `WhatsApp template sent successfully to ${formattedPhone}, ID: ${messageId}`,
      );
      return messageId;
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp template to ${formattedPhone}`,
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
