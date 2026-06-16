import { IsString, IsNotEmpty, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCustomThemeDto {
  @ApiProperty({ example: 'My Custom Theme' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: { primary: '#111111', secondary: '#222222' } })
  @IsObject()
  @IsNotEmpty()
  colorsJson: any;

  @ApiProperty({ example: { fontFamily: 'Inter' } })
  @IsObject()
  @IsNotEmpty()
  typographyJson: any;

  @ApiProperty({ example: { containerPadding: '2rem' } })
  @IsObject()
  @IsNotEmpty()
  spacingJson: any;

  @ApiProperty({ example: { borderRadius: '4px' } })
  @IsObject()
  @IsNotEmpty()
  buttonStylesJson: any;

  @ApiProperty({ example: { headerStyle: 'sticky' } })
  @IsObject()
  @IsNotEmpty()
  layoutRulesJson: any;
}
