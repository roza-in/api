import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsNumber,
  Min,
  IsInt,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateServiceDto {
  @ApiProperty({ description: 'Service name', example: "Men's Haircut" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Service description',
    example: 'Classic haircut with hot towel treatment',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ description: 'Service duration in minutes', example: 45 })
  @IsInt()
  @Min(1)
  @IsNotEmpty()
  duration: number;

  @ApiProperty({ description: 'Price of the service', example: 500.0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsNotEmpty()
  price: number;

  @ApiProperty({ description: 'Service category ID', example: 'category-uuid' })
  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @ApiProperty({
    description: 'Blocked buffer time after service in minutes',
    example: 10,
    required: false,
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  bufferTime?: number;

  @ApiProperty({
    description: 'Is the service active',
    example: true,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    description: 'Array of staff IDs assigned to this service',
    example: ['staff-uuid'],
    required: false,
  })
  @IsArray()
  @IsUUID(undefined, { each: true })
  @IsOptional()
  staffIds?: string[];
}
