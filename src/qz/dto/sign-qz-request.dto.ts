import { IsString } from 'class-validator';

export class SignQzRequestDto {
  @IsString({ message: 'data debe ser un string' })
  data: string;
}
