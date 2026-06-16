import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

describe('EncryptionService', () => {
  let service: EncryptionService;

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'DB_ENCRYPTION_KEY') {
        return 'test-encryption-key-for-database-123';
      }
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EncryptionService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<EncryptionService>(EncryptionService);
  });

  it('should encrypt and decrypt a string successfully', () => {
    const text = 'my-super-secret-api-key';
    const encrypted = service.encrypt(text);

    expect(encrypted).toBeDefined();
    expect(encrypted).not.toEqual(text);
    expect(encrypted.split(':')).toHaveLength(3);

    const decrypted = service.decrypt(encrypted);
    expect(decrypted).toEqual(text);
  });

  it('should throw an error when trying to decrypt invalid format', () => {
    expect(() => service.decrypt('invalid-format')).toThrow(
      'Invalid encrypted text format',
    );
  });

  it('should throw an error when decryption fails due to corrupted data', () => {
    const text = 'secret';
    const encrypted = service.encrypt(text);
    const parts = encrypted.split(':');
    // Corrupt the ciphertext
    const corrupted = `${parts[0]}:${parts[1]}:badhexdata`;
    expect(() => service.decrypt(corrupted)).toThrow('Decryption failed');
  });

  it('should handle keys shorter than 32 bytes by padding', () => {
    const shortConfigService = {
      get: jest.fn(() => 'shortkey'),
    };
    const shortService = new EncryptionService(
      shortConfigService as unknown as ConfigService,
    );
    const text = 'padded-test';
    const encrypted = shortService.encrypt(text);
    expect(shortService.decrypt(encrypted)).toEqual(text);
  });
});
