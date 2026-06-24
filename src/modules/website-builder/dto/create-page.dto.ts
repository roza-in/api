import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePageDto {
  @ApiProperty({ example: 'Our Team' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiProperty({
    example: 'our-team',
    description:
      'URL-friendly identifier. Must be lowercase, numbers, and hyphens only.',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers, and hyphens',
  })
  slug: string;

  @ApiPropertyOptional({ example: 'Meet our professional styling team' })
  @IsString()
  @IsOptional()
  seoDescription?: string;
}
