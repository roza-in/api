import { PartialType } from '@nestjs/swagger';
import { CreateStaffDto } from './create-staff.dto';
import { IsInt, IsNotEmpty } from 'class-validator';

export class UpdateStaffDto extends PartialType(CreateStaffDto) {
  @IsInt()
  @IsNotEmpty()
  version: number;
}
