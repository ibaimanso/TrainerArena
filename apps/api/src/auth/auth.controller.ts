import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Ip,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import type { RoleName } from '@apptorneos/shared';
import { RateLimitService } from '../common/rate-limit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ChangePasswordDto,
  DeleteAccountDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateProfileDto,
} from './auth.dto';
import { AllowUnverified, AuthGuard, Public } from './auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser, type AuthenticatedUser } from './current-user';

interface MeResponse {
  user: {
    id: number;
    name: string;
    email: string;
    emailVerified: boolean;
    roles: RoleName[];
  };
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.regenerate((err) => (err ? reject(err) : resolve()))
  );
}

function destroySession(req: Request): Promise<void> {
  return new Promise((resolve, reject) =>
    req.session.destroy((err) => (err ? reject(err) : resolve()))
  );
}

@Controller('auth')
@UseGuards(AuthGuard)
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
    private readonly rateLimit: RateLimitService
  ) {}

  @Public()
  @Post('register')
  async register(@Body() dto: RegisterDto, @Req() req: Request): Promise<MeResponse> {
    const user = await this.auth.register(dto.name, dto.email, dto.password);
    await regenerateSession(req);
    req.session.userId = user.id;
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: false,
        roles: ['player'],
      },
    };
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Ip() ip: string): Promise<MeResponse> {
    // 5/min per email+IP (SPEC §14)
    await this.rateLimit.consume(`login:${dto.email.toLowerCase()}:${ip}`, 5, 60);
    const user = await this.auth.validateCredentials(dto.email, dto.password);
    await regenerateSession(req);
    req.session.userId = user.id;
    const withRoles = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: { roles: { include: { role: true } } },
    });
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerifiedAt !== null,
        roles: withRoles.roles.map((r) => r.role.name as RoleName),
      },
    };
  }

  @AllowUnverified()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Request): Promise<{ ok: true }> {
    await destroySession(req);
    return { ok: true };
  }

  @AllowUnverified()
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): MeResponse {
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerifiedAt !== null,
        roles: user.roles,
      },
    };
  }

  @Public()
  @Get('verify-email')
  async verifyEmail(
    @Query('id') id: string,
    @Query('expires') expires: string,
    @Query('signature') signature: string
  ): Promise<{ ok: true }> {
    await this.auth.verifyEmail(Number(id), Number(expires), signature ?? '');
    return { ok: true };
  }

  @AllowUnverified()
  @Post('resend-verification')
  @HttpCode(200)
  async resendVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Ip() ip: string
  ): Promise<{ ok: true }> {
    await this.rateLimit.consume(`resend-verification:${user.id}:${ip}`, 3, 60 * 60);
    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    await this.auth.sendVerificationEmail(fresh);
    return { ok: true };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto, @Ip() ip: string): Promise<{ ok: true }> {
    // 3/h per IP (SPEC §14)
    await this.rateLimit.consume(`forgot-password:${ip}`, 3, 60 * 60);
    await this.auth.forgotPassword(dto.email);
    return { ok: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.auth.resetPassword(dto.email, dto.token, dto.password);
    return { ok: true };
  }

  @AllowUnverified()
  @Put('profile')
  async updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto
  ): Promise<MeResponse> {
    const updated = await this.auth.updateProfile(user.id, dto.name, dto.email);
    return {
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        emailVerified: updated.emailVerifiedAt !== null,
        roles: user.roles,
      },
    };
  }

  @AllowUnverified()
  @Put('profile/password')
  async changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto
  ): Promise<{ ok: true }> {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.password);
    return { ok: true };
  }

  @AllowUnverified()
  @Delete('profile')
  async deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
    @Req() req: Request
  ): Promise<{ ok: true }> {
    await this.auth.deleteAccount(user.id, dto.password);
    await destroySession(req);
    return { ok: true };
  }
}
