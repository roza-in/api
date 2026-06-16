import { IsNumber, IsPositive, IsOptional } from 'class-validator';

export class RefundPaymentDto {
  @IsNumber()
  @IsPositive()
  @IsOptional()
  amount?: number;
}
