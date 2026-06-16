import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ description: 'Category name', example: 'Hair Styling' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Parent category ID for nesting',
    example: 'a0b1c2d3-e4f5-6789-0123-456789abcdef',
    required: false,
  })
  @IsUUID()
  @IsOptional()
  parentCategoryId?: string;

  @ApiProperty({
    description: 'Is the category active',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
