import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RoleName } from '@apptorneos/shared';

/** Authenticated user attached to the request by AuthGuard. */
export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  emailVerifiedAt: Date | null;
  roles: RoleName[];
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  }
);
