import { IsNotEmpty, IsUUID, IsOptional, Matches } from 'class-validator';

export class AvailabilityQueryDto {
  @IsUUID()
  @IsNotEmpty()
  branchId: string;

  @IsUUID()
  @IsNotEmpty()
  serviceId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must be in YYYY-MM-DD format',
  })
  @IsNotEmpty()
  date: string;

  @IsUUID()
  @IsOptional()
  staffId?: string;
}
