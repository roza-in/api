import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsBoolean,
} from 'class-validator';

export class ExportReportDto {
  @IsEnum(['appointments', 'revenue', 'customers'])
  @IsNotEmpty()
  reportType: 'appointments' | 'revenue' | 'customers';

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsEnum(['csv', 'xlsx', 'pdf'])
  @IsNotEmpty()
  format: 'csv' | 'xlsx' | 'pdf';

  @IsBoolean()
  @IsOptional()
  async?: boolean;
}
