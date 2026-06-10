import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn } from 'class-validator';
import {
  canAssignRole,
  canRevokeRole,
  ROLE_NAMES,
  type RoleName,
} from '@apptorneos/shared';
import { AuditService } from '../audit/audit.service';
import { AuthGuard, RequireRoles } from '../auth/auth.guard';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user';
import { PrismaService } from '../prisma/prisma.service';

class RoleDto {
  @IsIn(ROLE_NAMES, { message: 'El rol no es válido.' })
  role!: RoleName;
}

const PAGE_SIZE = 25;

/** Superadmin user management (SPEC §12): paginated list, assign/revoke roles, audited. */
@Controller('superadmin/users')
@UseGuards(AuthGuard)
@RequireRoles('superadmin')
export class RolesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  @Get()
  async list(@Query('page') page = '1'): Promise<{
    users: { id: number; name: string; email: string; emailVerified: boolean; roles: RoleName[] }[];
    page: number;
    totalPages: number;
    total: number;
  }> {
    const pageNumber = Math.max(1, Number(page) || 1);
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        orderBy: { id: 'asc' },
        skip: (pageNumber - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { roles: { include: { role: true } } },
      }),
    ]);
    return {
      users: users.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        emailVerified: u.emailVerifiedAt !== null,
        roles: u.roles.map((r) => r.role.name as RoleName),
      })),
      page: pageNumber,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      total,
    };
  }

  @Post(':id/roles')
  @HttpCode(200)
  async assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) targetId: number,
    @Body() dto: RoleDto
  ): Promise<{ ok: true }> {
    if (!canAssignRole({ id: actor.id, roles: actor.roles, emailVerified: true }, targetId)) {
      throw new ForbiddenException('No puedes modificar tus propios roles.');
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('Usuario no encontrado.');
    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: dto.role } });
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId: targetId, roleId: role.id } },
      create: { userId: targetId, roleId: role.id },
      update: {},
    });
    await this.audit.log({
      actorId: actor.id,
      action: 'role.assigned',
      targetType: 'user',
      targetId,
      payload: { role: dto.role },
    });
    return { ok: true };
  }

  @Post(':id/roles/revoke')
  @HttpCode(200)
  async revoke(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id', ParseIntPipe) targetId: number,
    @Body() dto: RoleDto
  ): Promise<{ ok: true }> {
    if (
      !canRevokeRole({ id: actor.id, roles: actor.roles, emailVerified: true }, targetId, dto.role)
    ) {
      throw new ForbiddenException('Solo se pueden revocar los roles admin y judge, y nunca los propios.');
    }
    const target = await this.prisma.user.findUnique({ where: { id: targetId } });
    if (!target) throw new NotFoundException('Usuario no encontrado.');
    const role = await this.prisma.role.findUniqueOrThrow({ where: { name: dto.role } });
    await this.prisma.userRole.deleteMany({ where: { userId: targetId, roleId: role.id } });
    await this.audit.log({
      actorId: actor.id,
      action: 'role.revoked',
      targetType: 'user',
      targetId,
      payload: { role: dto.role },
    });
    return { ok: true };
  }
}
