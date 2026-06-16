import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWebsiteDto {
  @ApiProperty({
    example: '00000000-0000-0000-0000-000000000011',
    description: 'Selected system or custom theme ID',
  })
  @IsUUID()
  @IsNotEmpty()
  themeId: string;

  @ApiProperty({
    example: 'my-studio',
    description: 'Custom subdomain. Defaults to business slug if not provided.',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Subdomain must be lowercase alphanumeric with hyphens',
  })
  subdomain?: string;
}
