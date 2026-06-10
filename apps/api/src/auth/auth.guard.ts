import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { RoleName } from '@apptorneos/shared';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from './current-user';

export const IS_PUBLIC = 'isPublic';
/** Mark a route as accessible without authentication. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const SKIP_VERIFIED = 'skipVerified';
/** Authenticated routes that do not require a verified email (e.g. resend verification). */
export const AllowUnverified = () => SetMetadata(SKIP_VERIFIED, true);

export const ROLES_KEY = 'requiredRoles';
/** Require at least one of the given global roles. */
export const RequireRoles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Session auth guard. Loads the user (with roles) from the session and
 * enforces mandatory email verification (SPEC §12) plus optional role checks.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthenticatedUser }>();
    const userId = request.session?.userId;
    if (!userId) {
      throw new UnauthorizedException('No has iniciado sesión.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      throw new UnauthorizedException('No has iniciado sesión.');
    }

    request.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerifiedAt: user.emailVerifiedAt,
      roles: user.roles.map((r) => r.role.name as RoleName),
    };

    const skipVerified = this.reflector.getAllAndOverride<boolean>(SKIP_VERIFIED, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!skipVerified && !user.emailVerifiedAt) {
      throw new ForbiddenException('Debes verificar tu dirección de email para continuar.');
    }

    const requiredRoles = this.reflector.getAllAndOverride<RoleName[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredRoles && requiredRoles.length > 0) {
      const hasAny = requiredRoles.some((role) => request.user?.roles.includes(role));
      if (!hasAny) {
        throw new ForbiddenException('No tienes permisos para realizar esta acción.');
      }
    }

    return true;
  }
}
