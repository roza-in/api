import {
  IsString,
  IsNotEmpty,
  IsDateString,
  IsUUID,
  IsOptional,
} from 'class-validator';

export class CreateAppointmentDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsUUID()
  @IsNotEmpty()
  staffId: string;

  @IsUUID()
  @IsNotEmpty()
  customerId: string;

  @IsUUID()
  @IsNotEmpty()
  serviceId: string;

  @IsDateString()
  @IsNotEmpty()
  startTime: string;

  @IsString()
  @IsOptional()
  notes?: string;
}
