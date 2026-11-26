import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import type { PlatformLogin, PlatformLoginResponse, PlatformReset } from '@plateguard/contracts';
import { DUMMY_HASH } from '../auth/auth.service.js';
import { issuePlatformToken } from '../auth/token.js';
import { PlatformRepository } from './platform.repository.js';
import { matchTotp } from './totp.js';

/** After this many failed sign-ins in a row the account waits LOCK_MINUTES. */
export const MAX_PLATFORM_TRIES = 5;
export const LOCK_MINUTES = 15;

@Injectable()
export class PlatformService {
  constructor(private readonly repo: PlatformRepository) {}

  /**
   * Email, password and authenticator code, all three right. A failure never says which part
   * was wrong; the fifth in a row locks the account for a quarter of an hour.
   */
  async login(input: PlatformLogin, now = Date.now()): Promise<PlatformLoginResponse> {
    return this.signIn(input.email, input.code, now, (hash) =>
      this.repo.passwordMatches(input.password, hash),
    );
  }

  /**
   * A forgotten password: email and authenticator code set a new one and sign in. Same
   * lockout and one-use code as signing in, so it can't be used to guess codes.
   * shortcut: the code alone proves who it is, upgrade to an emailed link once mail exists.
   */
  async resetPassword(input: PlatformReset, now = Date.now()): Promise<PlatformLoginResponse> {
    const res = await this.signIn(input.email, input.code, now, () => Promise.resolve(true));
    await this.repo.setPassword(res.me.email, input.password);
    return res;
  }

  private async signIn(
    email: string,
    code: string,
    now: number,
    passwordMatches: (hash: string) => Promise<boolean>,
  ): Promise<PlatformLoginResponse> {
    const admin = await this.repo.findByEmail(email);
    const passwordOk = await passwordMatches(admin?.passwordHash ?? DUMMY_HASH);
    if (!admin) throw new UnauthorizedException({ code: 'LOGIN_INVALID' });
    const tries = await this.repo.reserveTry(admin.id, MAX_PLATFORM_TRIES, new Date(now));
    if (tries === null) throw new HttpException({ code: 'LOGIN_LOCKED' }, HttpStatus.LOCKED);

    const step = matchTotp(admin.totpSecret, code, now);
    const codeOk = step !== null && step > (admin.totpLastStep ?? -1);
    if (!passwordOk || !codeOk) {
      if (tries >= MAX_PLATFORM_TRIES) {
        await this.repo.failed(admin.id, 0, new Date(now + LOCK_MINUTES * 60_000));
        throw new HttpException({ code: 'LOGIN_LOCKED' }, HttpStatus.LOCKED);
      }
      throw new UnauthorizedException({ code: 'LOGIN_INVALID' });
    }
    await this.repo.signedIn(admin.id, step);
    return { ...issuePlatformToken(admin.id, now), me: { email: admin.email } };
  }
}
