import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import type { PlatformLogin, PlatformLoginResponse } from '@plateguard/contracts';
import { issuePlatformToken } from '../auth/token.js';
import { PlatformRepository } from './platform.repository.js';
import { matchTotp } from './totp.js';

/** After this many failed sign-ins in a row the account waits LOCK_MINUTES. */
export const MAX_PLATFORM_TRIES = 5;
export const LOCK_MINUTES = 15;

// Compared when the email is unknown, so an unknown email takes as long as a wrong password.
const DUMMY_HASH =
  'scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

@Injectable()
export class PlatformService {
  constructor(private readonly repo: PlatformRepository) {}

  /**
   * Email, password and authenticator code, all three right. A failure never says which part
   * was wrong; the fifth in a row locks the account for a quarter of an hour.
   */
  async login(input: PlatformLogin, now = Date.now()): Promise<PlatformLoginResponse> {
    const admin = await this.repo.findByEmail(input.email);
    const passwordOk = await this.repo.passwordMatches(
      input.password,
      admin?.passwordHash ?? DUMMY_HASH,
    );
    if (!admin) throw new UnauthorizedException({ code: 'LOGIN_INVALID' });
    if (admin.lockedUntil && admin.lockedUntil.getTime() > now)
      throw new HttpException({ code: 'LOGIN_LOCKED' }, HttpStatus.LOCKED);

    const step = matchTotp(admin.totpSecret, input.code, now);
    const codeOk = step !== null && step > (admin.totpLastStep ?? -1);
    if (!passwordOk || !codeOk) {
      const tries = admin.failedTries + 1;
      if (tries >= MAX_PLATFORM_TRIES) {
        await this.repo.failed(admin.id, 0, new Date(now + LOCK_MINUTES * 60_000));
        throw new HttpException({ code: 'LOGIN_LOCKED' }, HttpStatus.LOCKED);
      }
      await this.repo.failed(admin.id, tries, null);
      throw new UnauthorizedException({ code: 'LOGIN_INVALID' });
    }
    await this.repo.signedIn(admin.id, step);
    return { ...issuePlatformToken(admin.id, now), me: { email: admin.email } };
  }
}
