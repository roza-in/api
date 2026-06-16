import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsEmail,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidWorkingHours } from './working-hours.dto';
import type { WorkingHoursMap } from './working-hours.dto';

export class CreateBusinessBranchDto {
  @ApiProperty({ example: 'Main Branch' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '123 MG Road, Delhi NCR' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Invalid Indian phone number' })
  phone: string;

  @ApiPropertyOptional({ example: 'branch@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata', default: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Working hours per day. null = closed.',
    example: {
      monday: { open: '10:00', close: '20:00' },
      tuesday: { open: '10:00', close: '20:00' },
      wednesday: { open: '10:00', close: '20:00' },
      thursday: { open: '10:00', close: '20:00' },
      friday: { open: '10:00', close: '20:00' },
      saturday: { open: '10:00', close: '20:00' },
      sunday: null,
    },
  })
  @IsOptional()
  @IsValidWorkingHours()
  workingHours?: WorkingHoursMap;
}

export class CreateBusinessDto {
  @ApiProperty({ example: 'Glow Studio' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'glow-studio' })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message:
      'Slug must be lowercase alphanumeric with hyphens, cannot start or end with hyphen',
  })
  @MinLength(3)
  @MaxLength(60)
  slug?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Invalid Indian phone number' })
  phone?: string;

  @ApiPropertyOptional({ example: 'contact@glowstudio.in' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'Premium salon and wellness studio in Delhi NCR',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({
    description: 'Default branch details for the business',
    type: CreateBusinessBranchDto,
  })
  @ValidateNested()
  @Type(() => CreateBusinessBranchDto)
  @IsNotEmpty()
  branch: CreateBusinessBranchDto;
}
