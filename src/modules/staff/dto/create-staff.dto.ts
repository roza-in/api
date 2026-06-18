import {
  IsString,
  IsNotEmpty,
  IsEmail,
  Matches,
  IsArray,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { IsValidWorkingHours } from '../../business/dto/working-hours.dto';
import type { WorkingHoursMap } from '../../business/dto/working-hours.dto';

export class CreateStaffDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @Matches(/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/, {
    message: 'roleId must be a valid UUID',
  })
  @IsOptional()
  roleId?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Invalid Indian phone number' })
  @IsNotEmpty()
  phone: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  salary?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  commission?: number;

  @IsValidWorkingHours()
  @IsOptional()
  workingHours?: WorkingHoursMap;

  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  serviceIds?: string[];
}
