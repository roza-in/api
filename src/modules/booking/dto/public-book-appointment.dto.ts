import {
  IsString,
  IsNotEmpty,
  Matches,
  IsEmail,
  IsOptional,
  IsUUID,
  IsDateString,
  IsObject,
} from 'class-validator';

export class PublicBookAppointmentDto {
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Invalid Indian phone number' })
  customerPhone: string;

  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsUUID()
  @IsNotEmpty()
  serviceId: string;

  @IsUUID()
  @IsOptional()
  staffId?: string;

  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsObject()
  @IsOptional()
  consents?: {
    marketingWhatsapp?: boolean;
    marketingSms?: boolean;
    dataProcessing?: boolean;
  };
}
