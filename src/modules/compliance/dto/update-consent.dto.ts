import { IsNotEmpty, IsBoolean, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ConsentType, ConsentSource } from '../../../generated/prisma';

export class UpdateConsentDto {
  @ApiProperty({
    description: 'The type of consent',
    enum: ConsentType,
    example: ConsentType.MARKETING_WHATSAPP,
  })
  @IsEnum(ConsentType)
  @IsNotEmpty()
  consentType: ConsentType;

  @ApiProperty({
    description: 'Whether the consent is granted or revoked',
    example: true,
  })
  @IsBoolean()
  @IsNotEmpty()
  granted: boolean;

  @ApiProperty({
    description: 'The source where consent was given',
    enum: ConsentSource,
    example: ConsentSource.MANUAL,
    required: false,
    default: ConsentSource.MANUAL,
  })
  @IsEnum(ConsentSource)
  @IsOptional()
  source?: ConsentSource;
}
