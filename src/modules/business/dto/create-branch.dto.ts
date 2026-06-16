import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidWorkingHours } from './working-hours.dto';
import type { WorkingHoursMap } from './working-hours.dto';

export class CreateBranchDto {
  @ApiProperty({ example: 'South Extension Branch' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({ example: '45 South Extension Part 2, New Delhi' })
  @IsString()
  @IsNotEmpty()
  address: string;

  @ApiProperty({ example: '+919876543210' })
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Invalid Indian phone number' })
  phone: string;

  @ApiPropertyOptional({ example: 'south@glowstudio.in' })
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
