import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Registration form (SPEC §8.2). */
export class RegisterForTournamentDto {
  @IsString({ message: 'El nombre completo es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre completo es obligatorio.' })
  @MaxLength(120, { message: 'El nombre completo no puede superar los 120 caracteres.' })
  fullName!: string;

  @IsString({ message: 'El usuario de TCG Live es obligatorio.' })
  @IsNotEmpty({ message: 'El usuario de TCG Live es obligatorio.' })
  @MaxLength(60, { message: 'El usuario de TCG Live no puede superar los 60 caracteres.' })
  tcgLiveUsername!: string;

  @IsEmail({}, { message: 'El email no es válido.' })
  email!: string;

  @IsOptional()
  @IsString({ message: 'El teléfono no es válido.' })
  @MaxLength(30, { message: 'El teléfono no puede superar los 30 caracteres.' })
  phone?: string;
}
