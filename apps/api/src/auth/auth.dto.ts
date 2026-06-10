import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString({ message: 'El nombre es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(120, { message: 'El nombre no puede superar los 120 caracteres.' })
  name!: string;

  @IsEmail({}, { message: 'El email no es válido.' })
  @MaxLength(255, { message: 'El email no puede superar los 255 caracteres.' })
  email!: string;

  @IsString({ message: 'La contraseña es obligatoria.' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no puede superar los 72 caracteres.' })
  password!: string;
}

export class LoginDto {
  @IsEmail({}, { message: 'El email no es válido.' })
  email!: string;

  @IsString({ message: 'La contraseña es obligatoria.' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  password!: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'El email no es válido.' })
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail({}, { message: 'El email no es válido.' })
  email!: string;

  @IsString({ message: 'El token es obligatorio.' })
  @IsNotEmpty({ message: 'El token es obligatorio.' })
  token!: string;

  @IsString({ message: 'La contraseña es obligatoria.' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no puede superar los 72 caracteres.' })
  password!: string;
}

export class UpdateProfileDto {
  @IsString({ message: 'El nombre es obligatorio.' })
  @IsNotEmpty({ message: 'El nombre es obligatorio.' })
  @MaxLength(120, { message: 'El nombre no puede superar los 120 caracteres.' })
  name!: string;

  @IsEmail({}, { message: 'El email no es válido.' })
  @MaxLength(255, { message: 'El email no puede superar los 255 caracteres.' })
  email!: string;
}

export class ChangePasswordDto {
  @IsString({ message: 'La contraseña actual es obligatoria.' })
  @IsNotEmpty({ message: 'La contraseña actual es obligatoria.' })
  currentPassword!: string;

  @IsString({ message: 'La contraseña es obligatoria.' })
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres.' })
  @MaxLength(72, { message: 'La contraseña no puede superar los 72 caracteres.' })
  password!: string;
}

export class DeleteAccountDto {
  @IsString({ message: 'La contraseña es obligatoria.' })
  @IsNotEmpty({ message: 'La contraseña es obligatoria.' })
  password!: string;
}
