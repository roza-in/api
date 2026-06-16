import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class SaveConfigDto {
  @IsString()
  @IsNotEmpty()
  provider: string;

  @IsString()
  @IsNotEmpty()
  keyId: string;

  @IsString()
  @IsNotEmpty()
  keySecret: string;

  @IsString()
  @IsNotEmpty()
  webhookSecret: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
