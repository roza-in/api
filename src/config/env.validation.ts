import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsString,
  IsNotEmpty,
  IsOptional,
  validateSync,
} from 'class-validator';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsNumber()
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRY: string;

  @IsString()
  @IsNotEmpty()
  JWT_REFRESH_EXPIRY: string;

  @IsString()
  @IsNotEmpty()
  RAZORPAY_KEY_ID: string;

  @IsString()
  @IsNotEmpty()
  RAZORPAY_KEY_SECRET: string;

  @IsString()
  @IsNotEmpty()
  RAZORPAY_WEBHOOK_SECRET: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_API_URL: string;

  @IsString()
  @IsNotEmpty()
  WHATSAPP_ACCESS_TOKEN: string;

  @IsString()
  @IsOptional()
  WHATSAPP_VERIFY_TOKEN?: string;

  @IsString()
  @IsOptional()
  WHATSAPP_OTP_TEMPLATE_NAME?: string;

  @IsString()
  @IsOptional()
  MSG91_AUTH_KEY?: string;

  @IsString()
  @IsOptional()
  MSG91_SENDER_ID?: string;

  @IsString()
  @IsNotEmpty()
  AWS_SES_FROM_EMAIL: string;

  @IsString()
  @IsNotEmpty()
  AWS_ACCESS_KEY_ID: string;

  @IsString()
  @IsNotEmpty()
  AWS_SECRET_ACCESS_KEY: string;

  @IsString()
  @IsNotEmpty()
  AWS_S3_BUCKET: string;

  @IsString()
  @IsNotEmpty()
  AWS_REGION: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CALLBACK_URL: string;

  @IsString()
  @IsOptional()
  CORS_ALLOWED_ORIGINS?: string;
}

export function validate(config: Record<string, any>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error('Environment validation failed:\n' + errors.toString());
  }
  return validatedConfig;
}
