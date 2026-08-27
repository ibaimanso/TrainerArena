import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

/** Creation wizard validations (SPEC §12). */
export class CreateTournamentDto {
  @IsString({ message: 'El nombre es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(255, { message: 'El nombre no puede superar los 255 caracteres.' })
  name!: string;

  @IsOptional()
  @IsString({ message: 'La descripción no es válida.' })
  @MaxLength(5000, { message: 'La descripción no puede superar los 5000 caracteres.' })
  description?: string;

  @IsISO8601({}, { message: 'La fecha de inicio no es válida.' })
  startAt!: string;

  @IsOptional()
  @IsIn(['standard', 'league'], { message: 'El formato debe ser estándar o liga.' })
  format?: 'standard' | 'league';

  /** League only: one date per jornada; must match swissRounds in length. */
  @ValidateIf((o: CreateTournamentDto) => o.format === 'league')
  @IsArray({ message: 'Las fechas de las jornadas son obligatorias en formato liga.' })
  @ArrayMaxSize(15, { message: 'Una liga puede tener 15 jornadas como máximo.' })
  @IsISO8601({}, { each: true, message: 'Alguna fecha de jornada no es válida.' })
  matchdayDates?: string[];

  @IsOptional()
  @IsBoolean({ message: 'La visibilidad de las decklists debe ser un booleano.' })
  showOpponentDecklists?: boolean;

  @IsInt({ message: 'El número máximo de jugadores debe ser un entero.' })
  @Min(4, { message: 'El torneo necesita al menos 4 jugadores.' })
  @Max(9999, { message: 'El máximo de jugadores es 9999.' })
  maxPlayers!: number;

  @IsInt({ message: 'El número de rondas suizas debe ser un entero.' })
  @Min(1, { message: 'Debe haber al menos 1 ronda suiza.' })
  @Max(15, { message: 'El máximo de rondas suizas es 15.' })
  swissRounds!: number;

  @IsInt({ message: 'El tiempo de ronda debe ser un entero (minutos).' })
  @Min(10, { message: 'El tiempo de ronda mínimo es de 10 minutos.' })
  @Max(240, { message: 'El tiempo de ronda máximo es de 240 minutos.' })
  roundTimeMinutes!: number;

  @IsInt({ message: 'La ventana de check-in debe ser un entero (minutos).' })
  @Min(1, { message: 'La ventana de check-in mínima es de 1 minuto.' })
  @Max(60, { message: 'La ventana de check-in máxima es de 60 minutos.' })
  checkinMinutes!: number;

  @IsIn([1, 3], { message: 'El formato de las suizas debe ser BO1 o BO3.' })
  swissBo!: number;

  @IsIn([1, 3], { message: 'El formato del top cut debe ser BO1 o BO3.' })
  topCutBo!: number;

  @IsIn([0, 4, 8, 16, 32, 64], { message: 'El tamaño del top cut debe ser 0, 4, 8, 16, 32 o 64.' })
  topCutSize!: number;

  @IsInt({ message: 'La cuota debe ser un entero en céntimos.' })
  @Min(0, { message: 'La cuota no puede ser negativa.' })
  @Max(1000000, { message: 'La cuota máxima es de 1.000.000 céntimos.' })
  feeAmount!: number;

  @ValidateIf((o: CreateTournamentDto) => o.feeAmount > 0)
  @IsString({ message: 'Las instrucciones de pago son obligatorias en torneos de pago.' })
  @IsNotEmpty({ message: 'Las instrucciones de pago son obligatorias en torneos de pago.' })
  @MaxLength(1000, { message: 'Las instrucciones de pago no pueden superar los 1000 caracteres.' })
  paymentInstructions?: string;
}
