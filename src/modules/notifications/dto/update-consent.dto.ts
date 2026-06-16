import {
  IsNotEmpty,
  IsBoolean,
  IsUUID,
  IsOptional,
  IsEnum,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ConsentType, ConsentSource } from '../../../generated/prisma';

export class UpdateConsentDto {
  @ApiProperty({
    description: 'The UUID of the customer',
    example: 'd8c760b9-53cb-4db4-bb14-236b5ea5f6e8',
  })
  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @ApiProperty({
    description: 'The type of consent',
    enum: ConsentType,
    example: ConsentType.MARKETING_WHATSAPP,
  })
  @IsEnum(ConsentType)
  @IsNotEmpty()
  consentType: ConsentType;

  @ApiProperty({
    description: 'Whether consent is granted or revoked',
    example: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  granted: boolean;

  @ApiProperty({
    description: 'The source of this consent update',
    enum: ConsentSource,
    example: ConsentSource.MANUAL,
    required: false,
    default: ConsentSource.MANUAL,
  })
  @IsEnum(ConsentSource)
  @IsOptional()
  source?: ConsentSource;
}
