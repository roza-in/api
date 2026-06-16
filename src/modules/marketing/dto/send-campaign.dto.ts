import {
  IsEnum,
  IsOptional,
  IsArray,
  IsUUID,
  IsObject,
  ValidateIf,
  IsNotEmpty,
} from 'class-validator';
import { TargetAudience } from './create-campaign.dto';

export class SendCampaignDto {
  @IsEnum(TargetAudience)
  @IsNotEmpty()
  targetAudience: TargetAudience;

  @ValidateIf(
    (o: SendCampaignDto) => o.targetAudience === TargetAudience.SELECTED,
  )
  @IsArray()
  @IsUUID('all', { each: true })
  @IsNotEmpty({ each: true })
  customerIds?: string[];

  @IsObject()
  @IsOptional()
  variables?: Record<string, string>;
}
