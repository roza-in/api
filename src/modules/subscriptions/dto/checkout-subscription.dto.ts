import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CheckoutSubscriptionDto {
  @ApiProperty({ example: 'starter', description: 'Plan slug' })
  @IsString()
  @IsNotEmpty()
  planSlug: string;

  @ApiProperty({
    example: 'monthly',
    enum: ['monthly', 'yearly'],
    description: 'Billing cycle frequency',
  })
  @IsEnum(['monthly', 'yearly'])
  @IsNotEmpty()
  billingCycle: 'monthly' | 'yearly';
}
