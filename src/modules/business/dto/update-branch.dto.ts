import {
  IsString,
  IsOptional,
  IsInt,
  IsNotEmpty,
  MinLength,
  MaxLength,
  IsEmail,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsValidWorkingHours } from './working-hours.dto';
import type { WorkingHoursMap } from './working-hours.dto';

export class UpdateBranchDto {
  @ApiPropertyOptional({ example: 'South Extension Branch (Updated)' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '45 South Extension Part 2, New Delhi' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'south@glowstudio.in' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'Asia/Kolkata' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Working hours per day. null = closed.',
  })
  @IsOptional()
  @IsValidWorkingHours()
  workingHours?: WorkingHoursMap;

  @ApiProperty({
    description: 'Current version for optimistic locking',
    example: 1,
  })
  @IsInt()
  @IsNotEmpty()
  version: number;
}
