import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  IsDateString,
  IsArray,
  IsUUID,
  ValidateIf,
} from 'class-validator';

import { CampaignChannel } from '../../../generated/prisma';
export { CampaignChannel };

export enum TargetAudience {
  ALL = 'ALL',
  SELECTED = 'SELECTED',
}

export class CreateCampaignDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(CampaignChannel)
  @IsNotEmpty()
  channel: CampaignChannel;

  @IsString()
  @IsNotEmpty()
  messageTemplate: string; // e.g. "PROMO_CAMPAIGN", "MARKETING_OFFER"

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @IsEnum(TargetAudience)
  @IsNotEmpty()
  targetAudience: TargetAudience;

  @ValidateIf(
    (o: CreateCampaignDto) => o.targetAudience === TargetAudience.SELECTED,
  )
  @IsArray()
  @IsUUID('all', { each: true })
  @IsNotEmpty({ each: true })
  customerIds?: string[];
}
