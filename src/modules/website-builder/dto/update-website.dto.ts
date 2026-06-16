import {
  IsString,
  IsOptional,
  IsUUID,
  IsBoolean,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWebsiteDto {
  @ApiProperty({
    example: '00000000-0000-0000-0000-000000000012',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  themeId?: string;

  @ApiProperty({ example: 'my-new-studio-sub', required: false })
  @IsString()
  @IsOptional()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Subdomain must be lowercase alphanumeric with hyphens',
  })
  subdomain?: string;

  @ApiProperty({ example: 'mystudio.com', required: false })
  @IsString()
  @IsOptional()
  customDomain?: string;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
