import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateTicketRatingDto {
  @IsString({ message: 'ticketId debe ser un texto' })
  @IsNotEmpty({ message: 'ticketId es requerido' })
  ticketId!: string;

  @IsInt({ message: 'score debe ser un numero entero' })
  @Min(1, { message: 'score debe ser mayor o igual a 1' })
  @Max(5, { message: 'score debe ser menor o igual a 5' })
  score!: number;
}
