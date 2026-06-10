import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import type { User } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { passwordResetEmail, verificationEmail } from '../mail/mail.templates';
import { PrismaService } from '../prisma/prisma.service';
import { SignedUrlService } from '../common/signed-url.service';

const BCRYPT_ROUNDS = 12;
const VERIFICATION_TTL_SECONDS = 60 * 60; // 60 min
const RESET_TTL_MS = 60 * 60 * 1000; // 60 min

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly signedUrl: SignedUrlService,
    private readonly config: ConfigService
  ) {}

  private appUrl(): string {
    return this.config.get<string>('APP_URL', 'http://localhost:4200');
  }

  /** Register a new user: assigns the `player` role and queues the verification email. */
  async register(name: string, email: string, password: string): Promise<User> {
    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new UnprocessableEntityException('Ya existe una cuenta con ese email.');
    }
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: {
        name,
        email,
        password: hash,
        roles: {
          create: { role: { connect: { name: 'player' } } },
        },
      },
    });
    await this.sendVerificationEmail(user);
    return user;
  }

  async validateCredentials(email: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    const ok = user && (await bcrypt.compare(password, user.password));
    if (!ok) {
      throw new UnauthorizedException('Las credenciales no son correctas.');
    }
    return user;
  }

  async sendVerificationEmail(user: User): Promise<void> {
    if (user.emailVerifiedAt) return;
    const expires = Math.floor(Date.now() / 1000) + VERIFICATION_TTL_SECONDS;
    const signature = this.signedUrl.sign(`verify:${user.id}:${user.email}`, expires);
    const url = `${this.appUrl()}/verificar-email?id=${user.id}&expires=${expires}&signature=${signature}`;
    await this.mail.enqueue(verificationEmail(user.email, user.name, url));
  }

  /** Verify the signed URL and mark the email as verified (idempotent). */
  async verifyEmail(userId: number, expires: number, signature: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('El enlace de verificación no es válido.');
    }
    if (!this.signedUrl.verify(`verify:${user.id}:${user.email}`, expires, signature)) {
      throw new BadRequestException('El enlace de verificación no es válido o ha caducado.');
    }
    if (!user.emailVerifiedAt) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    }
  }

  /** Create a single-use reset token and queue the email. Silent for unknown emails. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return; // do not reveal account existence
    const token = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await this.prisma.passwordResetToken.deleteMany({ where: { email } });
    await this.prisma.passwordResetToken.create({
      data: { email, tokenHash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    const url = `${this.appUrl()}/restablecer-contrasena?token=${token}&email=${encodeURIComponent(email)}`;
    await this.mail.enqueue(passwordResetEmail(user.email, user.name, url));
  }

  async resetPassword(email: string, token: string, password: string): Promise<void> {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const row = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash } });
    const valid =
      row && row.email === email && row.usedAt === null && row.expiresAt > new Date();
    if (!valid) {
      throw new BadRequestException('El enlace de recuperación no es válido o ha caducado.');
    }
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new BadRequestException('El enlace de recuperación no es válido o ha caducado.');
    }
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: user.id }, data: { password: hash } }),
      this.prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      }),
    ]);
  }

  /** Update name/email. Changing the email resets verification and sends a new link. */
  async updateProfile(userId: number, name: string, email: string): Promise<User> {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (email !== current.email) {
      const taken = await this.prisma.user.findUnique({ where: { email } });
      if (taken) {
        throw new UnprocessableEntityException('Ya existe una cuenta con ese email.');
      }
    }
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        ...(email !== current.email ? { emailVerifiedAt: null } : {}),
      },
    });
    if (email !== current.email) {
      await this.sendVerificationEmail(user);
    }
    return user;
  }

  async changePassword(userId: number, currentPassword: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      throw new UnprocessableEntityException('La contraseña actual no es correcta.');
    }
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hash } });
  }

  async deleteAccount(userId: number, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new UnprocessableEntityException('La contraseña no es correcta.');
    }
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
