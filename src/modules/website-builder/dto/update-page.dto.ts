import { IsString, IsOptional, IsInt, IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePageDto {
  @ApiProperty({ example: 'Home Page', required: false })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({ example: 'home', required: false })
  @IsString()
  @IsOptional()
  slug?: string;

  @ApiProperty({
    example: [],
    description: 'JSON array of layout sections',
    required: false,
  })
  @IsOptional()
  contentJson?: any;

  @ApiProperty({ example: 'Welcome to My Studio', required: false })
  @IsString()
  @IsOptional()
  seoTitle?: string;

  @ApiProperty({ example: 'Best beauty services in town', required: false })
  @IsString()
  @IsOptional()
  seoDescription?: string;

  @ApiProperty({ example: 'https://cdn.rozx.in/og.jpg', required: false })
  @IsString()
  @IsOptional()
  seoOgImage?: string;

  @ApiProperty({ example: 1, required: false })
  @IsInt()
  @IsOptional()
  sortOrder?: number;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isPublished?: boolean;
}
