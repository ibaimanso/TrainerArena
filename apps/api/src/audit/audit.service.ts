import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  actorId?: number | null; // null/undefined = system
  action: string;
  targetType?: string;
  targetId?: number;
  payload?: Prisma.InputJsonValue;
}

/** Audit logger (SPEC §14). It NEVER throws: a logging failure must not break the operation. */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          targetType: entry.targetType ?? null,
          targetId: entry.targetId ?? null,
          payload: entry.payload ?? undefined,
        },
      });
    } catch (error) {
      this.logger.error(`Audit log failed for action ${entry.action}`, error as Error);
    }
  }
}
