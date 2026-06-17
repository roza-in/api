import { IsNotEmpty, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginOtpDto {
  @ApiProperty({ example: '+919876543210' })
  @Matches(/^(\+91)?[6-9]\d{9}$/, { message: 'Invalid Indian phone number' })
  @IsNotEmpty()
  phone: string;

  @ApiProperty({ example: '123456' })
  @Matches(/^\d{6}$/, { message: 'OTP must be a 6-digit number' })
  @IsNotEmpty()
  code: string;
}
