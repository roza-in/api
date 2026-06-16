import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

@Injectable()
export class EmailAdapter {
  private readonly logger = new Logger(EmailAdapter.name);
  private readonly sesClient: SESClient;
  private readonly fromEmail: string;

  constructor(private readonly configService: ConfigService) {
    const accessKeyId =
      this.configService.getOrThrow<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.getOrThrow<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    const region = this.configService.getOrThrow<string>('AWS_REGION');

    this.fromEmail =
      this.configService.getOrThrow<string>('AWS_SES_FROM_EMAIL');

    this.sesClient = new SESClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<string> {
    const command = new SendEmailCommand({
      Source: this.fromEmail,
      Destination: {
        ToAddresses: [to],
      },
      Message: {
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: html,
            Charset: 'UTF-8',
          },
        },
      },
    });

    try {
      this.logger.debug(`Sending SES Email to ${to}: ${subject}`);
      const response = await this.sesClient.send(command);

      const messageId = response.MessageId;
      if (!messageId) {
        throw new Error('No MessageId returned from AWS SES');
      }

      this.logger.log(
        `SES Email sent successfully to ${to}, MessageID: ${messageId}`,
      );
      return messageId;
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
