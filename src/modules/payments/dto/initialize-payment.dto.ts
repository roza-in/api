import { IsUUID, IsNotEmpty } from 'class-validator';

export class InitializePaymentDto {
  @IsUUID()
  @IsNotEmpty()
  appointmentId: string;
}
