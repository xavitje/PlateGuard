import { Injectable } from '@nestjs/common';
import { verifyPin } from '@plateguard/db';
import { PrismaService } from '../../common/prisma.service.js';

/**
 * Platform admins live outside every tenant, so these lookups use the system client. Nothing
 * here reads restaurant data.
 */
@Injectable()
export class PlatformRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string) {
    return this.prisma.system().platformAdmin.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.system().platformAdmin.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
  }

  /** Same scrypt format as the PINs. */
  passwordMatches(password: string, hash: string): Promise<boolean> {
    return verifyPin(password, hash);
  }

  failed(id: string, failedTries: number, lockedUntil: Date | null) {
    return this.prisma.system().platformAdmin.update({
      where: { id },
      data: { failedTries, lockedUntil },
    });
  }

  signedIn(id: string, totpLastStep: number) {
    return this.prisma.system().platformAdmin.update({
      where: { id },
      data: { failedTries: 0, lockedUntil: null, totpLastStep, lastLoginAt: new Date() },
    });
  }
}
