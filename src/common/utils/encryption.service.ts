import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const keyStr =
      this.configService.get<string>('DB_ENCRYPTION_KEY') ||
      'default-dev-encryption-key-32bytes!';
    // Ensure key is exactly 32 bytes for aes-256
    if (keyStr.length < 32) {
      this.key = Buffer.concat(
        [Buffer.from(keyStr), Buffer.alloc(32 - keyStr.length)],
        32,
      );
    } else {
      this.key = Buffer.from(keyStr.substring(0, 32));
    }
  }

  encrypt(text: string): string {
    try {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      const authTag = cipher.getAuthTag().toString('hex');
      return `${iv.toString('hex')}:${authTag}:${encrypted}`;
    } catch (error) {
      this.logger.error(
        'Encryption failed',
        error instanceof Error ? error.stack : '',
      );
      throw new Error('Encryption failed');
    }
  }

  decrypt(encryptedText: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted text format');
    }
    try {
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      this.logger.error(
        'Decryption failed',
        error instanceof Error ? error.stack : '',
      );
      throw new Error('Decryption failed');
    }
  }
}
