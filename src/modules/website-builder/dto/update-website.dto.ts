import { IsString, IsOptional, IsBoolean, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateWebsiteDto {
  @ApiProperty({
    example: '00000000-0000-0000-0000-000000000012',
    required: false,
  })
  @Matches(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    { message: 'themeId must be a valid UUID' },
  )
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
