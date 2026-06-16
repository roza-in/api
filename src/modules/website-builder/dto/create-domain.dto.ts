import { IsString, IsNotEmpty, Matches } from 'class-validator';

export class CreateDomainDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z0-9]+([-.]?[a-z0-9]+)*\.[a-z]{2,5}$/i, {
    message:
      'Invalid hostname format. Example: mydomain.com or booking.mydomain.in',
  })
  hostname: string;
}
