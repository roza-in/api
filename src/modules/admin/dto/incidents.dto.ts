import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import {
  IncidentSeverity,
  IncidentStatus,
  SystemStatusType as SystemComponentStatus,
} from '../../../generated/prisma';

export { IncidentSeverity, IncidentStatus, SystemComponentStatus };

export class CreateIncidentDto {
  @IsEnum(IncidentSeverity)
  @IsNotEmpty()
  severity: IncidentSeverity;

  @IsEnum(IncidentStatus)
  @IsNotEmpty()
  status: IncidentStatus;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsNotEmpty()
  startedAt: string;

  @IsBoolean()
  @IsOptional()
  isRepeat?: boolean;
}

export class UpdateIncidentDto {
  @IsEnum(IncidentSeverity)
  @IsOptional()
  severity?: IncidentSeverity;

  @IsEnum(IncidentStatus)
  @IsOptional()
  status?: IncidentStatus;

  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDateString()
  @IsOptional()
  startedAt?: string;

  @IsDateString()
  @IsOptional()
  resolvedAt?: string;

  @IsInt()
  @IsOptional()
  responseTimeMs?: number;

  @IsInt()
  @IsOptional()
  resolutionTimeMs?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  cSatScore?: number;

  @IsBoolean()
  @IsOptional()
  isRepeat?: boolean;
}

export class UpdateSystemStatusDto {
  @IsEnum(SystemComponentStatus)
  @IsNotEmpty()
  status: SystemComponentStatus;
}

export class UpdateBusinessStatusDto {
  @IsEnum(['ACTIVE', 'SUSPENDED'])
  @IsNotEmpty()
  status: 'ACTIVE' | 'SUSPENDED';
}

export class ExtendTrialDto {
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  extensionDays: number;
}
