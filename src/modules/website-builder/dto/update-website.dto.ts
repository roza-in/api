import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUrl,
  Matches,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SocialLinksDto {
  @ApiProperty({ example: 'https://instagram.com/mysalon', required: false })
  @IsUrl({}, { message: 'instagram must be a valid URL' })
  @IsOptional()
  instagram?: string;

  @ApiProperty({ example: 'https://facebook.com/mysalon', required: false })
  @IsUrl({}, { message: 'facebook must be a valid URL' })
  @IsOptional()
  facebook?: string;

  @ApiProperty({ example: 'https://twitter.com/mysalon', required: false })
  @IsUrl({}, { message: 'twitter must be a valid URL' })
  @IsOptional()
  twitter?: string;

  @ApiProperty({ example: 'https://youtube.com/@mysalon', required: false })
  @IsUrl({}, { message: 'youtube must be a valid URL' })
  @IsOptional()
  youtube?: string;

  @ApiProperty({ example: 'https://tiktok.com/@mysalon', required: false })
  @IsUrl({}, { message: 'tiktok must be a valid URL' })
  @IsOptional()
  tiktok?: string;

  @ApiProperty({
    example: 'https://linkedin.com/company/mysalon',
    required: false,
  })
  @IsUrl({}, { message: 'linkedin must be a valid URL' })
  @IsOptional()
  linkedin?: string;

  @ApiProperty({ example: 'https://wa.me/919876543210', required: false })
  @IsUrl({}, { message: 'whatsapp must be a valid URL' })
  @IsOptional()
  whatsapp?: string;
}

export class UpdateWebsiteDto {
  @ApiProperty({
    example: '00000000-0000-0000-0000-000000000002',
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

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  logoUrl?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  faviconUrl?: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  logoAltText?: string;

  @ApiProperty({
    required: false,
    type: SocialLinksDto,
    description: 'Social media profile URLs for the website footer',
  })
  @ValidateNested()
  @Type(() => SocialLinksDto)
  @IsOptional()
  socialLinks?: SocialLinksDto;
}
