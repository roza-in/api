import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token received from login or previous refresh',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
